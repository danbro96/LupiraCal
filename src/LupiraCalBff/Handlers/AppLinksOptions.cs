namespace LupiraCalBff.Handlers;

public sealed class AppLinksOptions
{
    public const string SectionName = "AppLinks";

    /// <summary>SHA-256 fingerprints of the certificates the Android app is signed with (Play signing + upload key).</summary>
    public string[] Sha256Fingerprints { get; set; } = [];
}
