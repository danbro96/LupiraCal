using Microsoft.AspNetCore.Http.HttpResults;

namespace LupiraCalBff.Handlers;

public static class RetiredPrefixHandler
{
    public static NotFound Handle() => TypedResults.NotFound();
}
