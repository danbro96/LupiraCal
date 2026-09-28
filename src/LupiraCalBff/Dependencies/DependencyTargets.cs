namespace LupiraCalBff.Dependencies;

/// <summary>Roster derived from the same <c>ReverseProxy:Clusters</c> the proxy and upstream clients
/// bind — edges cannot drift. Availability-only: the user-token seam can't be probed without a user.</summary>
public static class DependencyTargets
{
    public const string ProbePath = "readyz";

    private static readonly Dictionary<string, string> RegistryNames = new(StringComparer.OrdinalIgnoreCase)
    {
        ["cal-api"] = "lupira-cal-api",
        ["geo-api"] = "lupira-geo-api",
        ["contact-api"] = "lupira-contact-api",
        ["tasks-api"] = "lupira-tasks-api",
        ["location-api"] = "lupira-location-api",
        ["photo-api"] = "lupira-photo-api",
        ["comms-api"] = "lupira-comms-api",
    };

    public static IReadOnlyList<DependencyTarget> From(IConfiguration configuration) =>
        configuration.GetSection("ReverseProxy:Clusters").GetChildren()
            .Select(cluster => new DependencyTarget
            {
                Name = RegistryNames.TryGetValue(cluster.Key, out var name)
                    ? name
                    : throw new InvalidOperationException($"Cluster '{cluster.Key}' has no registry service name for /depz."),
                BaseUrl = cluster.GetSection("Destinations").GetChildren()
                    .Select(destination => destination["Address"])
                    .FirstOrDefault(a => !string.IsNullOrWhiteSpace(a)) ?? string.Empty,
                ProbePath = ProbePath,
            })
            .ToList();
}
