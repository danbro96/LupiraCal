using System.Text.RegularExpressions;
using Lupira.Bff.Proxy;
using Xunit;

namespace LupiraCalBff.UnitTests;

public class ProxyRoutesTests
{
    private static readonly IReadOnlyList<ProxyRoute> Routes =
        ProxyRoutes.Plan(ExposedSurface.Load(typeof(Program).Assembly));

    [Fact]
    public void Device_ingest_is_anonymous_untransformed_and_unprefixed()
    {
        var device = Routes.Where(r => r.Group.Credential == UpstreamCredential.DeviceKey).ToList();

        Assert.NotEmpty(device);
        Assert.All(device, route =>
        {
            Assert.Equal("Anonymous", route.Group.Policy);
            Assert.Null(route.RemovePrefix);
            Assert.StartsWith("/ingest/", route.Path, StringComparison.Ordinal);
        });
    }

    [Fact]
    public void Nothing_routes_a_surface_that_uses_a_different_credential()
    {
        // Anchored to the resource root, so a list owner's own /lists/{id}/shares stays fine. Device
        // ingest sits at /ingest/location with no cluster prefix, so it does not match either.
        var forbidden = new Regex(@"^/[a-z-]+/(pingz|ingest|shared|shares|users)(/|$)");

        Assert.DoesNotContain(Routes, r => forbidden.IsMatch(r.Path));
    }
}
