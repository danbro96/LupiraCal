using LupiraCalBff.Handlers;

namespace LupiraCalBff.Endpoints;

public static class RetiredPrefixEndpoints
{
    // Past clusters would otherwise fall through to the SPA shell instead of answering 404.
    public static IEndpointRouteBuilder MapRetiredPrefixes(this IEndpointRouteBuilder app)
    {
        app.Map("/location-api/{**rest}", RetiredPrefixHandler.Handle).AllowAnonymous().ExcludeFromDescription();
        app.Map("/ingest/{**rest}", RetiredPrefixHandler.Handle).AllowAnonymous().ExcludeFromDescription();

        return app;
    }
}
