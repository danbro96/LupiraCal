using LupiraCalBff.Handlers;

namespace LupiraCalBff.Endpoints;

public static class SiblingRedirectEndpoints
{
    public static IEndpointRouteBuilder MapSiblingRedirects(this IEndpointRouteBuilder app)
    {
        app.MapGet("/locations", SiblingRedirectHandler.Maps).AllowAnonymous().ExcludeFromDescription();
        app.MapGet("/places", SiblingRedirectHandler.MapsPlaces).AllowAnonymous().ExcludeFromDescription();
        app.MapGet("/photos", SiblingRedirectHandler.Photos).AllowAnonymous().ExcludeFromDescription();

        return app;
    }
}
