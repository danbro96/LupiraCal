using LupiraCalBff.Dependencies;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace LupiraCalBff.UnitTests;

/// <summary>The /depz roster is read from the proxy's cluster config: registry names, anonymous
/// <c>readyz</c> probes, one edge per cluster.</summary>
public class DependencyTargetsTests
{
    private static IConfiguration Clusters(params (string Cluster, string? Address)[] clusters) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(clusters.Select(c => new KeyValuePair<string, string?>(
                $"ReverseProxy:Clusters:{c.Cluster}:Destinations:primary:Address", c.Address)))
            .Build();

    [Fact]
    public void Every_cluster_maps_to_its_registry_service_name_and_address()
    {
        var targets = DependencyTargets.From(Clusters(
            ("cal-api", "https://cal-api.lupira.com"),
            ("geo-api", "https://geo-api.lupira.com"),
            ("contact-api", "https://contact-api.lupira.com"),
            ("tasks-api", "https://tasks-api.lupira.com"),
            ("location-api", "https://location-api.lupira.com"),
            ("photo-api", "https://photo-api.lupira.com"),
            ("comms-api", "https://comms-api.lupira.com")));

        Assert.Equal(
            new Dictionary<string, string>
            {
                ["lupira-cal-api"] = "https://cal-api.lupira.com",
                ["lupira-geo-api"] = "https://geo-api.lupira.com",
                ["lupira-contact-api"] = "https://contact-api.lupira.com",
                ["lupira-tasks-api"] = "https://tasks-api.lupira.com",
                ["lupira-location-api"] = "https://location-api.lupira.com",
                ["lupira-photo-api"] = "https://photo-api.lupira.com",
                ["lupira-comms-api"] = "https://comms-api.lupira.com",
            },
            targets.ToDictionary(t => t.Name, t => t.BaseUrl));
    }

    [Fact]
    public void Probes_are_anonymous_readyz()
    {
        var targets = DependencyTargets.From(Clusters(("cal-api", "https://cal-api.lupira.com"), ("geo-api", "http://localhost:5260")));

        Assert.All(targets, t =>
        {
            Assert.Equal("readyz", t.ProbePath);
            Assert.Null(t.TokenUrl);
            Assert.Null(t.ClientId);
            Assert.Null(t.ClientSecret);
            Assert.Null(t.Scope);
            Assert.Null(t.DevUser);
        });
    }

    [Fact]
    public void A_cluster_without_an_address_is_kept_with_a_blank_base_url()
    {
        var target = Assert.Single(DependencyTargets.From(Clusters(("tasks-api", ""))));

        Assert.Equal("lupira-tasks-api", target.Name);
        Assert.Equal(string.Empty, target.BaseUrl);
    }

    [Fact]
    public void An_unmapped_cluster_fails_fast()
    {
        var ex = Assert.Throws<InvalidOperationException>(() => DependencyTargets.From(Clusters(("mystery-api", "https://x"))));

        Assert.Contains("mystery-api", ex.Message);
    }
}
