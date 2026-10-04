using Lupira.Bff.Proxy;
using LupiraCalBff.Upstream.Contact;
using Microsoft.Kiota.Abstractions.Authentication;
using Microsoft.Kiota.Http.HttpClientLibrary;

namespace LupiraCalBff.Upstream;

/// <summary>Typed upstream clients for the endpoints the BFF serves itself.</summary>
public static class UpstreamClientExtensions
{
    public static IServiceCollection AddUpstreamClients(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddKiotaClient<ContactApiClient>(configuration, "contact-api", adapter => new ContactApiClient(adapter));
        return services;
    }

    private static void AddKiotaClient<TClient>(
        this IServiceCollection services,
        IConfiguration configuration,
        string cluster,
        Func<HttpClientRequestAdapter, TClient> create)
        where TClient : class
    {
        // Base addresses come from the proxy's own cluster config, so there is one place that says
        // where an upstream lives whether a call is proxied or handled here.
        var address = configuration
            .GetSection($"ReverseProxy:Clusters:{cluster}:Destinations")
            .GetChildren()
            .Select(destination => destination["Address"])
            .FirstOrDefault(a => !string.IsNullOrWhiteSpace(a))
            ?? throw new InvalidOperationException($"No destination address configured for cluster '{cluster}'.");

        services.AddHttpClient(cluster, http => http.BaseAddress = new Uri(address))
            .AddHttpMessageHandler<SessionTokenHandler>();

        services.AddScoped(provider =>
        {
            var http = provider.GetRequiredService<IHttpClientFactory>().CreateClient(cluster);
            // Anonymous by design: SessionTokenHandler owns the credential, so proxied and handled
            // calls share one auth path instead of two.
            var adapter = new HttpClientRequestAdapter(new AnonymousAuthenticationProvider(), httpClient: http)
            {
                BaseUrl = address,
            };
            return create(adapter);
        });
    }
}
