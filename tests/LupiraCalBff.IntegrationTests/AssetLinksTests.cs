using System.Net;
using System.Text.Json;
using Xunit;

namespace LupiraCalBff.IntegrationTests;

public class AssetLinksTests(BffTestFactory factory) : IClassFixture<BffTestFactory>
{
    [Fact]
    public async Task Serves_the_configured_fingerprints_without_authentication()
    {
        using var configured = factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("AppLinks:Sha256Fingerprints:0", "AA:BB");
            b.UseSetting("AppLinks:Sha256Fingerprints:1", "CC:DD");
        });

        var resp = await configured.CreateClient(new() { AllowAutoRedirect = false }).GetAsync("/.well-known/assetlinks.json");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal("application/json", resp.Content.Headers.ContentType?.MediaType);
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        var link = Assert.Single(doc.RootElement.EnumerateArray());
        Assert.Equal("delegate_permission/common.handle_all_urls", Assert.Single(link.GetProperty("relation").EnumerateArray()).GetString());
        var target = link.GetProperty("target");
        Assert.Equal("android_app", target.GetProperty("namespace").GetString());
        Assert.Equal("com.lupira.calendar", target.GetProperty("package_name").GetString());
        Assert.Equal(["AA:BB", "CC:DD"], target.GetProperty("sha256_cert_fingerprints").EnumerateArray().Select(e => e.GetString()));
    }

    [Fact]
    public async Task Lists_no_fingerprints_when_unconfigured()
    {
        var resp = await factory.CreateClient().GetAsync("/.well-known/assetlinks.json");

        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        Assert.Empty(doc.RootElement[0].GetProperty("target").GetProperty("sha256_cert_fingerprints").EnumerateArray());
    }
}
