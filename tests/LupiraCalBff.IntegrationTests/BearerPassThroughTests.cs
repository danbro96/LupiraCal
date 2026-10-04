using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Xunit;

namespace LupiraCalBff.IntegrationTests;

/// <summary>The two front doors of the member proxy: a caller-presented bearer authenticates and is forwarded
/// verbatim to every upstream; anonymous API calls get status codes (never Authentik redirects) on every
/// proxied prefix; garbage bearers are rejected at the BFF.</summary>
public class BearerPassThroughTests(BffTestFactory factory) : IClassFixture<BffTestFactory>
{
    private readonly BffTestFactory _factory = factory;

    private HttpClient Client()
    {
        var c = _factory.CreateClient(new() { AllowAutoRedirect = false });
        return c;
    }

    [Theory]
    [InlineData("/api/items", "/items")]
    [InlineData("/geo-api/places", "/places")]
    [InlineData("/contact-api/contacts", "/contacts")]
    [InlineData("/tasks-api/items", "/items")]
    [InlineData("/location-api/location/visits", "/location/visits")]
    [InlineData("/photo-api/photos", "/photos")]
    [InlineData("/comms-api/topics", "/topics")]
    public async Task Valid_bearer_is_accepted_and_forwarded_verbatim(string path, string upstreamPath)
    {
        var client = Client();
        var token = BffTestFactory.MintToken();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var resp = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var echo = (await resp.Content.ReadFromJsonAsync<UpstreamEcho>())!;
        Assert.Equal(upstreamPath, echo.Path);
        Assert.Equal($"Bearer {token}", echo.Authorization);   // the caller's token, untouched — not a cookie exchange
        Assert.Equal("", echo.XDevUser);                       // production never sends the dev header
    }

    [Theory]
    [InlineData("/api/items")]
    [InlineData("/geo-api/places")]
    [InlineData("/contact-api/contacts")]
    [InlineData("/tasks-api/items")]
    [InlineData("/location-api/location/visits")]
    [InlineData("/photo-api/photos")]
    [InlineData("/comms-api/topics")]
    public async Task Anonymous_api_calls_get_401_not_a_redirect(string path)
    {
        var resp = await Client().GetAsync(path);
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
        Assert.Null(resp.Headers.Location);
    }

    [Fact]
    public async Task Wrong_audience_bearer_is_rejected()
    {
        var client = Client();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", BffTestFactory.MintToken(audience: "someone-else"));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/items")).StatusCode);
    }

    [Fact]
    public async Task Garbage_bearer_is_rejected()
    {
        var client = Client();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "not-a-jwt");
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/items")).StatusCode);
    }

    [Fact]
    public async Task Anonymous_page_navigation_still_redirects_to_sign_in()
    {
        // The browser path is untouched: a non-API route challenge redirects toward the identity provider
        // (the static test metadata's authorize endpoint) instead of returning a bare 401.
        var resp = await Client().GetAsync("/auth/login");
        Assert.True(resp.StatusCode is HttpStatusCode.Redirect or HttpStatusCode.Found,
            $"expected a redirect, got {(int)resp.StatusCode}");
    }
}
