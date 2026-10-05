using LupiraCalBff.Dtos;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;

namespace LupiraCalBff.Handlers;

public static class AssetLinksHandler
{
    private const string AndroidPackage = "com.lupira.calendar";

    public static Ok<AssetLinkDto[]> Handle(IOptions<AppLinksOptions> appLinks) =>
        TypedResults.Ok(new[]
        {
            new AssetLinkDto
            {
                Relation = ["delegate_permission/common.handle_all_urls"],
                Target = new AssetLinkTargetDto
                {
                    Namespace = "android_app",
                    PackageName = AndroidPackage,
                    Sha256CertFingerprints = appLinks.Value.Sha256Fingerprints,
                },
            },
        });
}
