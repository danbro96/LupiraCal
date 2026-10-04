using System.Text.RegularExpressions;
using Lupira.Bff.Proxy;
using Xunit;

namespace LupiraCalBff.UnitTests;

public class ProxyRoutesTests
{
    private static readonly IReadOnlyList<ProxyRoute> Routes =
        ProxyRoutes.Plan(ExposedSurface.Load(typeof(Program).Assembly));

    [Fact]
    public void Every_route_uses_the_session_credential()
    {
        Assert.All(Routes, route => Assert.NotEqual(UpstreamCredential.DeviceKey, route.Group.Credential));
    }

    [Fact]
    public void Nothing_routes_a_surface_that_uses_a_different_credential()
    {
        // Anchored to the resource root, so a list owner's own /lists/{id}/shares stays fine.
        var forbidden = new Regex(@"^/[a-z-]+/(pingz|ingest|shared|shares|users)(/|$)");

        Assert.DoesNotContain(Routes, r => forbidden.IsMatch(r.Path));
    }
}
