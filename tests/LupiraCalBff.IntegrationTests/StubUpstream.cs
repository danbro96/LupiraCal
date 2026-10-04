using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace LupiraCalBff.IntegrationTests;

/// <summary>
/// In-process upstream the YARP clusters point at during tests: a real Kestrel listener on an ephemeral port
/// that echoes back what the proxy actually sent (path + auth headers), so tests can assert the pass-through
/// behavior instead of trusting the transform code.
/// </summary>
public sealed class StubUpstream : IAsyncDisposable
{
    private readonly WebApplication _app;

    public string Address { get; }

    private StubUpstream(WebApplication app, string address)
    {
        _app = app;
        Address = address;
    }

    public static async Task<StubUpstream> StartAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.Logging.ClearProviders();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        var app = builder.Build();

        app.Map("/{**path}", (HttpContext ctx) => Results.Json(new UpstreamEcho(
            ctx.Request.Path.ToString(),
            ctx.Request.Headers.Authorization.ToString(),
            ctx.Request.Headers["X-Dev-User"].ToString())));

        await app.StartAsync();
        var address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First();
        return new StubUpstream(app, address);
    }

    public async ValueTask DisposeAsync() => await _app.DisposeAsync();
}
