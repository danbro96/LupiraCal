using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;
using System.Text;
using Xunit;

namespace LupiraCalBff.IntegrationTests;

/// <summary>
/// Hosts the BFF in the Production wiring (cookie + OIDC + bearer, the shipped policy) with the YARP clusters
/// pointed at an in-process stub upstream. The bearer scheme is re-keyed to a local symmetric signing key so
/// tests mint their own tokens; the OIDC handler gets a static configuration so challenges never fetch
/// metadata. No cookie session is established — the cookie path's redirect-vs-401 behavior is still exercised
/// because the OIDC challenge runs for every unauthenticated request.
/// </summary>
public sealed class BffTestFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string Issuer = "https://auth.test/";
    public const string Audience = "lupira-cal";
    private static readonly SymmetricSecurityKey SigningKey =
        new(Encoding.UTF8.GetBytes("lupira-cal-web-integration-test-signing-key-0123456789"));

    public StubUpstream Upstream { get; private set; } = null!;

    public async Task InitializeAsync() => Upstream = await StubUpstream.StartAsync();

    async Task IAsyncLifetime.DisposeAsync()
    {
        await Upstream.DisposeAsync();
        await base.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Production");
        // UseSetting, not ConfigureAppConfiguration: with minimal hosting the factory's config sources are
        // appended at Build(), AFTER Program.cs top-level code has already read values like KeyPath — settings
        // injected this way are visible from the first line.
        builder.UseSetting("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:9");
        builder.UseSetting("ReverseProxy:Clusters:cal-api:Destinations:primary:Address", Upstream.Address);
        builder.UseSetting("ReverseProxy:Clusters:geo-api:Destinations:primary:Address", Upstream.Address);
        builder.UseSetting("ReverseProxy:Clusters:contact-api:Destinations:primary:Address", Upstream.Address);
        builder.UseSetting("ReverseProxy:Clusters:tasks-api:Destinations:primary:Address", Upstream.Address);
        builder.UseSetting("ReverseProxy:Clusters:location-api:Destinations:primary:Address", Upstream.Address);
        builder.UseSetting("ReverseProxy:Clusters:photo-api:Destinations:primary:Address", Upstream.Address);
        builder.UseSetting("ReverseProxy:Clusters:comms-api:Destinations:primary:Address", Upstream.Address);
        builder.UseSetting("Auth:Oidc:Authority", Issuer);
        builder.UseSetting("Auth:Oidc:ClientId", "lupira-cal");
        builder.UseSetting("DataProtection:KeyPath", "");
        builder.ConfigureTestServices(services =>
        {
            // Local signing key instead of Authentik discovery.
            services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, o =>
            {
                o.Authority = null;
                o.ConfigurationManager = null;
                o.RequireHttpsMetadata = false;
                o.TokenValidationParameters.ValidIssuer = Issuer;
                o.TokenValidationParameters.ValidAudience = Audience;
                o.TokenValidationParameters.IssuerSigningKey = SigningKey;
            });
            // Static OIDC metadata so an unauthenticated challenge never leaves the process.
            services.PostConfigure<OpenIdConnectOptions>(OpenIdConnectDefaults.AuthenticationScheme, o =>
            {
                o.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(
                    new OpenIdConnectConfiguration
                    {
                        Issuer = Issuer,
                        AuthorizationEndpoint = $"{Issuer}authorize",
                        TokenEndpoint = $"{Issuer}token",
                    });
            });
        });
    }

    /// <summary>Mint a bearer the re-keyed scheme accepts. Pass a wrong audience/issuer to make it rejectable.</summary>
    public static string MintToken(string email = "user@test", string audience = Audience, string issuer = Issuer)
    {
        var handler = new JsonWebTokenHandler();
        return handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = issuer,
            Audience = audience,
            Expires = DateTime.UtcNow.AddMinutes(10),
            Subject = new ClaimsIdentity([new Claim("email", email), new Claim("sub", $"test|{email}")]),
            SigningCredentials = new SigningCredentials(SigningKey, SecurityAlgorithms.HmacSha256),
        });
    }
}
