using System.Text.Json.Serialization;

namespace LupiraCalBff.Dtos;

public sealed class AssetLinkTargetDto
{
    [JsonPropertyName("namespace")]
    public required string Namespace { get; set; }

    [JsonPropertyName("package_name")]
    public required string PackageName { get; set; }

    [JsonPropertyName("sha256_cert_fingerprints")]
    public required string[] Sha256CertFingerprints { get; set; }
}
