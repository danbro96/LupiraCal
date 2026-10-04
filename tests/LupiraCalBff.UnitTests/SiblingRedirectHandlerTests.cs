using LupiraCalBff.Handlers;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using Xunit;

namespace LupiraCalBff.UnitTests;

public class SiblingRedirectHandlerTests
{
    private static readonly IOptions<SiblingsOptions> Siblings = Options.Create(new SiblingsOptions
    {
        Maps = "https://maps.example/",
        Photos = "https://photos.example",
    });

    private static HttpRequest Request(string query) =>
        new DefaultHttpContext { Request = { QueryString = new QueryString(query) } }.Request;

    [Fact]
    public void Maps_keeps_the_query_string_verbatim()
    {
        var result = SiblingRedirectHandler.Maps(Request("?at=1,2&layers=photos"), Siblings);

        Assert.True(result.Permanent);
        Assert.Equal("https://maps.example/?at=1,2&layers=photos", result.Url);
    }

    [Fact]
    public void Photos_without_a_query_targets_the_host_root()
    {
        Assert.Equal("https://photos.example/", SiblingRedirectHandler.Photos(Request(string.Empty), Siblings).Url);
    }

    [Fact]
    public void Places_targets_the_maps_places_screen_and_drops_the_query()
    {
        Assert.Equal("https://maps.example/places", SiblingRedirectHandler.MapsPlaces(Siblings).Url);
    }
}
