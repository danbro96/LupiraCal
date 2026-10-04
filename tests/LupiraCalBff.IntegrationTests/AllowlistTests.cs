using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Xunit;

namespace LupiraCalBff.IntegrationTests;

public class AllowlistTests(BffTestFactory factory) : IClassFixture<BffTestFactory>
{
    private const string DeviceKey = "DeviceKey 0123456789abcdef0123456789abcdef.0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

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
    [InlineData(null)]
    [InlineData("Bearer abc")]
    [InlineData("DeviceKey not-a-key")]
    public async Task Device_ingest_rejects_a_missing_or_malformed_key(string? authorization)
    {
        var resp = await Client(authorization).GetAsync("/ingest/location/state");

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task Device_ingest_forwards_a_well_formed_key_untouched_at_the_upstream_path()
    {
        var resp = await Client(DeviceKey).GetAsync("/ingest/location/state");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var echo = (await resp.Content.ReadFromJsonAsync<UpstreamEcho>())!;
        Assert.Equal("/ingest/location/state", echo.Path);
        Assert.Equal(DeviceKey, echo.Authorization);
    }

    [Fact]
    public async Task Depz_without_the_probe_key_is_401()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client().GetAsync("/depz")).StatusCode);
    }

    private HttpClient Client(string? authorization = null)
    {
        var client = factory.CreateClient(new() { AllowAutoRedirect = false });
        if (authorization is not null)
            client.DefaultRequestHeaders.TryAddWithoutValidation("Authorization", authorization);
        return client;
    }
}
