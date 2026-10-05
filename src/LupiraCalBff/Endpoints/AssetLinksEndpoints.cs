using LupiraCalBff.Handlers;

namespace LupiraCalBff.Endpoints;

public static class AssetLinksEndpoints
{
    /// <summary>Android verifies the app's App Links against this file, anonymously.</summary>
    public static IEndpointRouteBuilder MapAssetLinks(this IEndpointRouteBuilder app)
    {
        app.MapGet("/.well-known/assetlinks.json", AssetLinksHandler.Handle).AllowAnonymous().ExcludeFromDescription();

        return app;
    }
}
