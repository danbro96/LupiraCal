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
    [InlineData("/geo-api/geocode/reverse?lat=60.13&lon=12.99&precision=Building", "/geocode/reverse")]
    [InlineData("/api/place-usage", "/place-usage")]
    [InlineData("/api/sync/items", "/sync/items")]
    [InlineData("/api/sync/calendars", "/sync/calendars")]
    [InlineData("/contact-api/sync/contacts", "/sync/contacts")]
    [InlineData("/contact-api/sync/relationships", "/sync/relationships")]
    [InlineData("/contact-api/sync/residencies", "/sync/residencies")]
    [InlineData("/contact-api/sync/place-entries", "/sync/place-entries")]
    [InlineData("/contact-api/sync/address-books", "/sync/address-books")]
    [InlineData("/contact-api/sync/groups", "/sync/groups")]
    [InlineData("/tasks-api/sync/items", "/sync/items")]
    [InlineData("/tasks-api/sync/lists", "/sync/lists")]
    [InlineData("/tasks-api/lists", "/lists")]
    [InlineData("/tasks-api/lists/3f2b8c1e-9d4a-4b7e-8a51-0c6d2e9f7a13/items", "/lists/3f2b8c1e-9d4a-4b7e-8a51-0c6d2e9f7a13/items")]
    public async Task Listed_operations_the_clients_still_call_are_forwarded(string path, string upstreamPath)
    {
        var client = Client();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", BffTestFactory.MintToken());

        var resp = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal(upstreamPath, (await resp.Content.ReadFromJsonAsync<UpstreamEcho>())!.Path);
    }

    [Theory]
    [InlineData("GET", "/calendars/3f2b8c1e-9d4a-4b7e-8a51-0c6d2e9f7a13/subscriptions")]
    [InlineData("POST", "/calendars/3f2b8c1e-9d4a-4b7e-8a51-0c6d2e9f7a13/subscriptions")]
    [InlineData("PUT", "/calendars/3f2b8c1e-9d4a-4b7e-8a51-0c6d2e9f7a13/subscriptions/7a1d4e2b-5c8f-4b3a-9e6d-1f2a3b4c5d6e")]
    [InlineData("DELETE", "/calendars/3f2b8c1e-9d4a-4b7e-8a51-0c6d2e9f7a13/subscriptions/7a1d4e2b-5c8f-4b3a-9e6d-1f2a3b4c5d6e")]
    [InlineData("POST", "/calendars/3f2b8c1e-9d4a-4b7e-8a51-0c6d2e9f7a13/subscriptions/7a1d4e2b-5c8f-4b3a-9e6d-1f2a3b4c5d6e/refresh")]
    [InlineData("GET", "/calendars/3f2b8c1e-9d4a-4b7e-8a51-0c6d2e9f7a13/subscriptions/7a1d4e2b-5c8f-4b3a-9e6d-1f2a3b4c5d6e/events/0b9e4c2a-6d1f-4a8e-b3c7-5e2f9a1d8c40")]
    [InlineData("GET", "/sync/subscribed-events")]
    public async Task Subscription_operations_are_forwarded(string method, string upstreamPath)
    {
        var client = Client();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", BffTestFactory.MintToken());

        var resp = await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), "/api" + upstreamPath));
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal(upstreamPath, (await resp.Content.ReadFromJsonAsync<UpstreamEcho>())!.Path);
    }

    [Theory]
    [InlineData("/api/items/drafts?zone=Europe/Stockholm", "/items/drafts", "text/calendar")]
    [InlineData("/contact-api/contacts/drafts", "/contacts/drafts", "text/vcard")]
    public async Task Draft_reads_are_forwarded(string path, string upstreamPath, string contentType)
    {
        var client = Client();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", BffTestFactory.MintToken());

        var resp = await client.PostAsync(path, new StringContent("BEGIN", MediaTypeHeaderValue.Parse(contentType)));
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal(upstreamPath, (await resp.Content.ReadFromJsonAsync<UpstreamEcho>())!.Path);
    }

    [Fact]
    public async Task Task_create_is_forwarded()
    {
        var client = Client();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", BffTestFactory.MintToken());

        var resp = await client.PostAsJsonAsync("/tasks-api/lists/3f2b8c1e-9d4a-4b7e-8a51-0c6d2e9f7a13/items", new { title = "x" });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal("/lists/3f2b8c1e-9d4a-4b7e-8a51-0c6d2e9f7a13/items", (await resp.Content.ReadFromJsonAsync<UpstreamEcho>())!.Path);
    }

    [Fact]
    public async Task Place_from_pin_is_forwarded()
    {
        var client = Client();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", BffTestFactory.MintToken());

        var resp = await client.PostAsJsonAsync("/geo-api/places/from-pin", new { latitude = 60.13, longitude = 12.99 });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal("/places/from-pin", (await resp.Content.ReadFromJsonAsync<UpstreamEcho>())!.Path);
    }

    [Fact]
    public async Task Residency_move_out_is_forwarded()
    {
        var client = Client();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", BffTestFactory.MintToken());

        var resp = await client.PostAsJsonAsync("/contact-api/residencies/3f2b8c1e-9d4a-4b7e-8a51-0c6d2e9f7a13/move-out", new { movedOut = new { year = 2026 } });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal("/residencies/3f2b8c1e-9d4a-4b7e-8a51-0c6d2e9f7a13/move-out", (await resp.Content.ReadFromJsonAsync<UpstreamEcho>())!.Path);
    }

    [Fact]
    public async Task Participant_reminder_put_is_forwarded()
    {
        var client = Client();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", BffTestFactory.MintToken());

        var request = new HttpRequestMessage(HttpMethod.Put,
            "/api/items/3f2b8c1e-9d4a-4b7e-8a51-0c6d2e9f7a13/participants/7a1d4e2b-5c8f-4b3a-9e6d-1f2a3b4c5d6e/reminder?mode=Before&minutesBefore=30");
        request.Headers.Add("Idempotency-Key", "0b9e4c2a-6d1f-4a8e-b3c7-5e2f9a1d8c40");
        var resp = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal("/items/3f2b8c1e-9d4a-4b7e-8a51-0c6d2e9f7a13/participants/7a1d4e2b-5c8f-4b3a-9e6d-1f2a3b4c5d6e/reminder", (await resp.Content.ReadFromJsonAsync<UpstreamEcho>())!.Path);
    }

    [Fact]
    public async Task Depz_without_the_probe_key_is_401()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client().GetAsync("/depz")).StatusCode);
    }

    private HttpClient Client() => factory.CreateClient(new() { AllowAutoRedirect = false });
}
