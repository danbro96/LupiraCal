using System.Net.Http.Headers;
using System.Text.Json.Serialization;
using Duende.AccessTokenManagement;
using Duende.AccessTokenManagement.OpenIdConnect;
using LupiraCalBff.Auth;
using LupiraCalBff.Dependencies;
using LupiraCalBff.Endpoints;
using LupiraCalBff.OpenApi;
using LupiraCalBff.Proxy;
using LupiraCalBff.Upstream;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Scalar.AspNetCore;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using Yarp.ReverseProxy.Transforms;

// Writes the generator's input, then exits. Kiota's output compiles into this project, so the BFF
// cannot produce that input during the same build — refreshing a spec is copy, normalize, generate,
// build. See UpstreamSpecRefresh for the paths.
if (args is ["--normalize-specs", ..])
{
    UpstreamSpecRefresh.WriteNormalized(args.ElementAtOrDefault(1));
    return;
}

var builder = WebApplication.CreateBuilder(args);

// `--routes` prints what the proxy will serve.
if (args is ["--routes", ..])
{
    foreach (var (key, value) in ProxyRoutes.Build(ExposedSurface.Load()).OrderBy(r => r.Key, StringComparer.Ordinal))
        Console.WriteLine($"{key} = {value}");
    return;
}

// One exact template per allowlisted path, as a config source: YARP's LoadFromConfig and the
// ApiPrefixes fence then read it exactly as they read appsettings, and clusters stay hand-maintained.
builder.Configuration.AddInMemoryCollection(ProxyRoutes.Build(ExposedSurface.Load()));

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// Prod: Authentik OIDC + server-side cookie session (the SPA never holds a token). Dev: a local user.
builder.AddCalAuth();

// Persist data-protection keys so the auth cookie survives container restarts (mount DataProtection:KeyPath).
var keyPath = builder.Configuration["DataProtection:KeyPath"];
if (!string.IsNullOrWhiteSpace(keyPath))
    builder.Services.AddDataProtection()
        .SetApplicationName("LupiraCalBff")
        .PersistKeysToFileSystem(new DirectoryInfo(keyPath));

builder.Services.AddAppHealthChecks();
builder.Services.AddUpstreamClients(builder.Configuration);

// Non-gating dependency probe (/depz): edges derive from the proxy's clusters, probed on a dedicated client.
builder.Services.Configure<DepzOptions>(builder.Configuration.GetSection(DepzOptions.SectionName));
var depzOptions = builder.Configuration.GetSection(DepzOptions.SectionName).Get<DepzOptions>() ?? new DepzOptions();
builder.Services.AddSingleton(DependencyTargets.From(builder.Configuration));
builder.Services.AddSingleton<DependencyReportCache>();
builder.Services.AddSingleton<DependencyProbe>();
builder.Services.AddHttpClient(DependencyProbe.ProbeClientName, c => c.Timeout = depzOptions.ProbeTimeout);
if (depzOptions.Enabled)
    builder.Services.AddHostedService<DependencyPollWorker>();

// MSBuild runs this same pipeline on build and writes openapi/LupiraCalBff.json — the file the
// TypeScript client generates from.
builder.Services.AddOpenApi(options => options.AddDocumentTransformer<BffDocumentTransformer>());

// Reverse proxy to the upstream APIs (REST at the upstream root, so the prefix is stripped). The member
// routes (default policy) carry the signed-in user's access token. A caller-presented bearer (the mobile
// app) is forwarded verbatim — YARP copies the Authorization header, so the transform stands aside; the
// upstreams validate the token themselves (its audience covers cal/contact/geo). Dev forwards X-Dev-User
// instead of a token so the stack runs without Authentik.
var isDev = builder.Environment.IsDevelopment();
var devUser = builder.Configuration["Dev:User"] ?? "dev@localhost";
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"))
    .AddTransforms(ctx => ctx.AddRequestTransform(async transform =>
    {
        var incoming = transform.HttpContext.Request.Headers.Authorization.ToString();
        if (incoming.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            return;   // native caller — its own token flows through untouched

        // Device ingest: only location-api can validate a device key, so it must reach the upstream
        // intact. Overwriting it with the session token (or X-Dev-User) is what used to force the
        // phone to bypass the BFF entirely.
        if (incoming.StartsWith(DeviceKeyHeader.Scheme, StringComparison.Ordinal))
            return;

        if (isDev)
        {
            // Replace, never append: StringValues joins duplicates with a comma and the upstream's dev
            // handler derives its principal from the value, so a caller-supplied header would other-
            // wise change who the request runs as.
            transform.ProxyRequest.Headers.Remove("X-Dev-User");
            transform.ProxyRequest.Headers.TryAddWithoutValidation("X-Dev-User", devUser);
        }
        else if (transform.HttpContext.User.Identity?.IsAuthenticated == true)
        {
            var token = await transform.HttpContext.GetUserAccessTokenAsync().GetToken();
            var accessToken = token.AccessToken.ToString();
            if (!string.IsNullOrEmpty(accessToken))
                transform.ProxyRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        }
    }));

// OpenTelemetry → platform collector. Env-gated: a no-op without OTEL_EXPORTER_OTLP_ENDPOINT (local
// dev stays silent). Protocol/headers/interval/resource-attrs come from the standard OTEL_* env vars.
var otlpEndpoint = builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"];
if (!string.IsNullOrWhiteSpace(otlpEndpoint))
{
    builder.Services.AddOpenTelemetry()
        .ConfigureResource(r => r.AddService(
            serviceName: "lupira-cal-web",
            serviceVersion: typeof(Program).Assembly.GetName().Version?.ToString() ?? "0.0.0"))
        .WithTracing(t => t
            .AddAspNetCoreInstrumentation(o =>
            {
                o.RecordException = true;
                // Health probes are polled constantly by docker + devops-monitor; their spans add nothing.
                o.Filter = ctx => ctx.Request.Path != "/livez" && ctx.Request.Path != "/readyz"
                    && ctx.Request.Path != "/depz";
            })
            .AddHttpClientInstrumentation()
            .AddOtlpExporter())
        .WithMetrics(m => m
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddRuntimeInstrumentation()
            .AddMeter("LupiraCalBff.*")
            .AddOtlpExporter());

    builder.Logging.AddOpenTelemetry(o =>
    {
        o.IncludeFormattedMessage = true;
        o.IncludeScopes = true;
        o.AddOtlpExporter();
    });
}

var app = builder.Build();

// Behind the reverse proxy: trust X-Forwarded-* so OIDC redirect URIs and Secure cookies use https.
// cloudflared reaches us from a Docker-bridge IP, not loopback, so the default KnownProxies/KnownNetworks
// allowlist would drop the headers — clear it. Safe only because the container's sole ingress is the tunnel.
var forwardedHeaders = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
};
forwardedHeaders.KnownIPNetworks.Clear();
forwardedHeaders.KnownProxies.Clear();
app.UseForwardedHeaders(forwardedHeaders);

if (app.Environment.IsProduction())
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.MapAppHealthChecks();

app.UseStaticFiles();

// The ingest routes are Anonymous because the device key is only checkable by location-api, which
// holds the keys. Reject a missing or malformed header here so the route is not a blank relay, and
// answer 401 rather than letting the cookie handler challenge a device with an OIDC redirect.
app.UseWhen(
    ctx => ctx.Request.Path.StartsWithSegments("/ingest", StringComparison.OrdinalIgnoreCase),
    branch => branch.Use(async (ctx, next) =>
    {
        if (!DeviceKeyHeader.IsWellFormed(ctx.Request.Headers.Authorization))
        {
            ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        await next();
    }));

app.UseAuthentication();
app.UseAuthorization();

app.MapAuthEndpoints(app.Environment);
app.MapContactEndpoints();
app.MapDepz();

// Authenticated: the document is the whole internal API map, and the client reads the committed
// file rather than this endpoint.
app.MapOpenApi("/openapi/{documentName}.json").RequireAuthorization();
app.MapScalarApiReference("/scalar").RequireAuthorization();

app.MapReverseProxy();

// A proxied prefix that matched no route is a 404, not the SPA shell. Without this the fallback
// answers 200/text-html for anything under an API prefix, so a removed route and a live one look
// alike from outside. Literal segments outrank this catch-all, so it only fires on a real miss.
foreach (var prefix in ApiPrefixes(app.Configuration))
    app.Map($"{prefix}/{{**rest}}", () => Results.NotFound());

// SPA shell — served anonymously; the SPA's RequireAuth guard and the proxy route's policy enforce auth.
app.MapFallbackToFile("index.html");

app.Run();

// The first segment of every proxy route's path, so the fence can't drift from the route table.
static string[] ApiPrefixes(IConfiguration config) =>
    config.GetSection("ReverseProxy:Routes").GetChildren()
        .Select(route => route["Match:Path"])
        .Where(path => !string.IsNullOrWhiteSpace(path))
        .Select(path => $"/{path!.TrimStart('/').Split('/')[0]}")
        .Distinct()
        .ToArray();

// Exposes the implicit Program entry point to the integration test assembly (WebApplicationFactory<Program>).
public partial class Program;
