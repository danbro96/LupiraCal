using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Xunit;

namespace LupiraCalBff.IntegrationTests;

public class AllowlistTests(BffTestFactory factory) : IClassFixture<BffTestFactory>
{
    [Theory]
    [InlineData("/api/mcp")]
    [InlineData("/api/internal/items")]
    [InlineData("/tasks-api/shared/abc")]
    [InlineData("/photo-api/openapi/v1.json")]
    public async Task Unlisted_path_under_a_proxied_prefix_is_404(string path)
    {
        var client = Client();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", BffTestFactory.MintToken());

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(path)).StatusCode);
    }

    [Theory]
    [InlineData("/location-api/location/visits")]
    [InlineData("/location-api/devices")]
    [InlineData("/ingest/location/state")]
    [InlineData("/ingest/location/cursor")]
    public async Task Retired_location_surface_is_404_not_the_spa_shell(string path)
    {
        var client = Client();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", BffTestFactory.MintToken());

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Client().GetAsync(path)).StatusCode);
    }

    [Fact]
    public async Task Device_ingest_post_is_404()
    {
        var client = Client();
        client.DefaultRequestHeaders.TryAddWithoutValidation("Authorization",
            "DeviceKey 0123456789abcdef0123456789abcdef.0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");

        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync("/ingest/location", null)).StatusCode);
    }

    [Theory]
    [InlineData("GET", "/photo-api/photos/albums")]
    [InlineData("GET", "/photo-api/photos/stats")]
    [InlineData("GET", "/photo-api/photos/map?bbox=0,0,1,1")]
    [InlineData("GET", "/photo-api/photos/3f2b8c1e-9d4a-4b7e-8a51-0c6d2e9f7a13")]
    [InlineData("POST", "/photo-api/photos")]
    [InlineData("POST", "/photo-api/photos/3f2b8c1e-9d4a-4b7e-8a51-0c6d2e9f7a13/trash")]
    [InlineData("DELETE", "/photo-api/photos/trash")]
    [InlineData("GET", "/geo-api/places")]
    [InlineData("PATCH", "/geo-api/places/3f2b8c1e-9d4a-4b7e-8a51-0c6d2e9f7a13")]
    [InlineData("GET", "/geo-api/places/3f2b8c1e-9d4a-4b7e-8a51-0c6d2e9f7a13/history")]
    [InlineData("POST", "/geo-api/places/3f2b8c1e-9d4a-4b7e-8a51-0c6d2e9f7a13/regeocode")]
    [InlineData("GET", "/geo-api/curation/orphans")]
    [InlineData("POST", "/geo-api/curation/prune")]
    [InlineData("GET", "/api/items/by-place/3f2b8c1e-9d4a-4b7e-8a51-0c6d2e9f7a13")]
    [InlineData("POST", "/api/items/3f2b8c1e-9d4a-4b7e-8a51-0c6d2e9f7a13/relations/batch")]
    [InlineData("POST", "/contact-api/residencies/3f2b8c1e-9d4a-4b7e-8a51-0c6d2e9f7a13/move-out")]
    [InlineData("GET", "/tasks-api/lists/3f2b8c1e-9d4a-4b7e-8a51-0c6d2e9f7a13")]
    public async Task Operation_removed_from_the_allowlist_is_not_forwarded(string method, string path)
    {
        var client = Client();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", BffTestFactory.MintToken());

        var resp = await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path));

        Assert.NotEqual("application/json", resp.Content.Headers.ContentType?.MediaType);
        Assert.True(resp.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.MethodNotAllowed, $"got {(int)resp.StatusCode}");
    }

    [Theory]
    [InlineData("/photo-api/photos", "/photos")]
    [InlineData("/geo-api/places/suggest", "/places/suggest")]
    public async Task Listed_operations_the_clients_still_call_are_forwarded(string path, string upstreamPath)
    {
        var client = Client();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", BffTestFactory.MintToken());

        var resp = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal(upstreamPath, (await resp.Content.ReadFromJsonAsync<UpstreamEcho>())!.Path);
    }

    [Fact]
    public async Task Depz_without_the_probe_key_is_401()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client().GetAsync("/depz")).StatusCode);
    }

    private HttpClient Client() => factory.CreateClient(new() { AllowAutoRedirect = false });
}
