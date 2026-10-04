using System.Net;
using Xunit;

namespace LupiraCalBff.IntegrationTests;

public class SiblingRedirectTests(BffTestFactory factory) : IClassFixture<BffTestFactory>
{
    [Theory]
    [InlineData("/locations?at=1,2&layers=photos", "https://maps.lupira.com/?at=1,2&layers=photos")]
    [InlineData("/locations?from=2026-01-01&to=2026-01-31", "https://maps.lupira.com/?from=2026-01-01&to=2026-01-31")]
    [InlineData("/locations?place=abc&item=def", "https://maps.lupira.com/?place=abc&item=def")]
    [InlineData("/locations", "https://maps.lupira.com/")]
    [InlineData("/photos?event=x", "https://photos.lupira.com/?event=x")]
    [InlineData("/photos?event=x&photo=y", "https://photos.lupira.com/?event=x&photo=y")]
    [InlineData("/photos", "https://photos.lupira.com/")]
    [InlineData("/places", "https://maps.lupira.com/places")]
    public async Task Moved_screen_redirects_permanently_before_authentication(string path, string target)
    {
        var resp = await factory.CreateClient(new() { AllowAutoRedirect = false }).GetAsync(path);

        Assert.Equal(HttpStatusCode.MovedPermanently, resp.StatusCode);
        Assert.Equal(target, resp.Headers.Location?.OriginalString);
    }

    [Fact]
    public async Task Target_hosts_are_configuration()
    {
        using var configured = factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("Siblings:Maps", "https://maps.example/");
            b.UseSetting("Siblings:Photos", "https://photos.example");
        });
        var client = configured.CreateClient(new() { AllowAutoRedirect = false });

        Assert.Equal("https://maps.example/?at=1,2", (await client.GetAsync("/locations?at=1,2")).Headers.Location?.OriginalString);
        Assert.Equal("https://maps.example/places", (await client.GetAsync("/places")).Headers.Location?.OriginalString);
        Assert.Equal("https://photos.example/?event=x", (await client.GetAsync("/photos?event=x")).Headers.Location?.OriginalString);
    }
}
