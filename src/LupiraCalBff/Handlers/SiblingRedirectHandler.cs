using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;

namespace LupiraCalBff.Handlers;

public static class SiblingRedirectHandler
{
    public static RedirectHttpResult Maps(HttpRequest request, IOptions<SiblingsOptions> siblings) =>
        Permanent(siblings.Value.Maps, string.Empty, request);

    public static RedirectHttpResult MapsPlaces(IOptions<SiblingsOptions> siblings) =>
        Permanent(siblings.Value.Maps, "places", null);

    public static RedirectHttpResult Photos(HttpRequest request, IOptions<SiblingsOptions> siblings) =>
        Permanent(siblings.Value.Photos, string.Empty, request);

    private static RedirectHttpResult Permanent(string host, string path, HttpRequest? request) =>
        TypedResults.Redirect($"{host.TrimEnd('/')}/{path}{request?.QueryString.Value}", permanent: true);
}
