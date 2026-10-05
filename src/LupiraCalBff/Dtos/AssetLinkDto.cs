using System.Text.Json.Serialization;

namespace LupiraCalBff.Dtos;

public sealed class AssetLinkDto
{
    [JsonPropertyName("relation")]
    public required string[] Relation { get; set; }

    [JsonPropertyName("target")]
    public required AssetLinkTargetDto Target { get; set; }
}
