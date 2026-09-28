using System.Text.Json.Nodes;

namespace LupiraCalBff.OpenApi;

/// <summary>
/// Reconstructs the BFF's own OpenAPI document from the upstream specs it proxies: prefixes each
/// upstream's paths with the route it is mounted on, keeps only the allowlisted operations, and
/// merges the schemas they reach.
/// </summary>
/// <remarks>
/// On the JSON DOM, not <c>OpenApiDocument</c>: renaming a colliding schema means retargeting every
/// <c>$ref</c> to it, and the typed model exposes referenced nodes read-only.
/// </remarks>
internal static class UpstreamSpecMerger
{
    /// <summary>Cluster to spec. The order decides which upstream keeps an unprefixed schema name.</summary>
    private static readonly (string Cluster, string Resource)[] Sources =
    [
        ("cal-api", "LupiraCalApi"),
        ("contact-api", "LupiraContactApi"),
        ("geo-api", "LupiraGeoApi"),
        ("tasks-api", "LupiraTasksApi"),
        ("location-api", "LupiraLocationApi"),
        ("photo-api", "LupiraPhotoApi"),
        ("comms-api", "LupiraCommsApi"),
    ];

    public static MergeResult Merge(ExposedSurface exposed)
    {
        var notExposed = new List<string>();
        var missing = new List<string>();
        var renames = new List<string>();

        var docs = Sources
            .Select(s => (s.Cluster, Doc: ReadEmbedded($"LupiraCalBff.upstream.{s.Resource}.json")))
            .ToArray();

        // A mixed merge would need down-levelling: 3.1 nullables (`type: [x, 'null']`) are invalid in 3.0.
        var versions = docs.Select(d => d.Doc["openapi"]?.GetValue<string>()).Distinct().ToArray();
        if (versions.Length != 1)
            throw new InvalidOperationException($"Upstream specs disagree on OpenAPI version: {string.Join(", ", versions)}");

        var mergedPaths = new JsonObject();
        var mergedSchemas = new JsonObject();
        var claimedSchemas = new Dictionary<string, (string Signature, string Cluster)>(StringComparer.Ordinal);
        var claimedOperations = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var (cluster, doc) in docs)
        {
            var prefix = ExposedSurface.ClusterPrefixes[cluster];
            var tag = cluster.Replace("-api", string.Empty, StringComparison.Ordinal);
            var allowed = new HashSet<string>(exposed.Operations.GetValueOrDefault(cluster) ?? [], StringComparer.Ordinal);

            var kept = PruneToAllowlist(doc, allowed, tag, cluster, notExposed);
            missing.AddRange(allowed.Select(entry => $"{cluster}  {entry}"));

            var schemas = doc["components"]?["schemas"]?.AsObject() ?? [];
            var live = ReachableSchemas(kept, schemas);

            // A name already claimed with a DIFFERENT shape gets its cluster as a namespace; identical
            // shapes dedupe for free.
            var rename = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var name in live)
            {
                var signature = schemas[name]?.ToJsonString() ?? "null";
                if (!claimedSchemas.TryGetValue(name, out var prior))
                {
                    claimedSchemas[name] = (signature, cluster);
                    continue;
                }

                if (prior.Signature == signature) continue;

                var alias = Pascal(cluster) + name;
                rename[name] = alias;
                claimedSchemas[alias] = (signature, cluster);
                renames.Add($"{name} ({prior.Cluster} vs {cluster}) -> {alias}");
            }

            RewriteSchemaRefs(kept, rename);

            // Operation ids name the generated functions, and they collide too — cal and tasks both
            // declare GetItem for genuinely different operations. Same rule as schemas.
            foreach (var operation in Operations(kept))
            {
                var id = operation["operationId"]?.GetValue<string>();
                if (id is null) continue;
                if (!claimedOperations.TryGetValue(id, out var prior))
                {
                    claimedOperations[id] = cluster;
                    continue;
                }

                var alias = Pascal(cluster) + id;
                operation["operationId"] = alias;
                claimedOperations[alias] = cluster;
                renames.Add($"{id}() ({prior} vs {cluster}) -> {alias}()");
            }

            foreach (var (path, item) in kept)
            {
                var copy = item?.DeepClone();
                if (copy is JsonObject pathItem) RewriteSecurity(pathItem);
                mergedPaths[prefix + path] = copy;
            }

            foreach (var name in live)
            {
                var final = rename.GetValueOrDefault(name, name);
                var schema = schemas[name]?.DeepClone();
                if (schema is null) continue;
                RewriteSchemaRefs(schema, rename);
                mergedSchemas[final] ??= schema;
            }
        }

        var document = new JsonObject
        {
            ["openapi"] = versions[0],
            ["info"] = new JsonObject { ["title"] = "LupiraCal BFF", ["version"] = "v1" },
            ["paths"] = mergedPaths,
            ["components"] = new JsonObject
            {
                ["schemas"] = mergedSchemas,
                ["securitySchemes"] = SecuritySchemes(),
            },
        };

        if (missing.Count > 0)
            throw new InvalidOperationException(
                $"exposed.json lists operations no upstream declares:{Environment.NewLine}  {string.Join($"{Environment.NewLine}  ", missing)}");

        return new MergeResult(document, notExposed, renames);
    }

    /// <summary>
    /// The credential presented to the BFF, not the upstream's own. Uncarried, the requirements dangle
    /// and Microsoft.OpenApi writes them as <c>[{}]</c> — which reads as "no authentication required".
    /// </summary>
    private static JsonObject SecuritySchemes() => new()
    {
        ["Cookie"] = new JsonObject
        {
            ["type"] = "apiKey",
            ["in"] = "cookie",
            ["name"] = "__Host-lupira-cal",
            ["description"] = "Session cookie minted by the BFF's OIDC login.",
        },
        ["Bearer"] = new JsonObject
        {
            ["type"] = "http",
            ["scheme"] = "bearer",
            ["bearerFormat"] = "JWT",
            ["description"] = "Authentik access token from a native client; audience must include lupira-cal.",
        },
    };

    /// <summary>DefaultPolicy accepts either scheme, so both are alternatives rather than both required.</summary>
    private static void RewriteSecurity(JsonObject pathItem)
    {
        foreach (var (_, node) in pathItem)
        {
            if (node is JsonObject operation && operation.ContainsKey("responses"))
            {
                operation["security"] = new JsonArray
                {
                    new JsonObject { ["Cookie"] = new JsonArray() },
                    new JsonObject { ["Bearer"] = new JsonArray() },
                };
            }
        }
    }

    /// <summary>Drops every operation the allowlist does not name, and removes what it consumed from it.</summary>
    private static JsonObject PruneToAllowlist(
        JsonObject doc, HashSet<string> allowed, string tag, string cluster, List<string> notExposed)
    {
        var kept = new JsonObject();
        foreach (var (path, item) in doc["paths"]?.AsObject() ?? [])
        {
            if (item is not JsonObject pathItem) continue;
            var keptItem = new JsonObject();
            foreach (var (verb, node) in pathItem)
            {
                if (node is not JsonObject operation || !operation.ContainsKey("responses"))
                {
                    keptItem[verb] = node?.DeepClone();   // path-level `parameters` and friends
                    continue;
                }

                var entry = $"{verb.ToUpperInvariant()} {path}";
                if (!allowed.Remove(entry))
                {
                    if (operation.ContainsKey("operationId")) notExposed.Add($"{cluster}  {entry}");
                    continue;
                }

                var copy = (JsonObject)operation.DeepClone();
                // One tag per operation so the generator's tag split lands each upstream in its own folder.
                copy["tags"] = new JsonArray(tag);
                keptItem[verb] = copy;
            }

            if (keptItem.Any(kv => kv.Value is JsonObject o && o.ContainsKey("responses")))
                kept[path] = keptItem;
        }

        return kept;
    }

    /// <summary>Schemas the pruned paths still reach, transitively — so a dropped path drops its DTOs.</summary>
    private static HashSet<string> ReachableSchemas(JsonNode paths, JsonObject schemas)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var queue = new Queue<JsonNode>();
        queue.Enqueue(paths);

        while (queue.TryDequeue(out var node))
        {
            switch (node)
            {
                case JsonObject obj:
                    foreach (var (key, value) in obj)
                    {
                        if (key == "$ref" && value?.GetValue<string>() is { } reference)
                        {
                            var name = SchemaName(reference);
                            if (name is not null && seen.Add(name) && schemas[name] is { } target)
                                queue.Enqueue(target);
                        }
                        else if (value is not null)
                        {
                            queue.Enqueue(value);
                        }
                    }

                    break;
                case JsonArray array:
                    foreach (var value in array.Where(v => v is not null)) queue.Enqueue(value!);
                    break;
            }
        }

        return seen;
    }

    /// <summary>
    /// Repoints <c>$ref</c>s at their renamed schema, structurally and scoped to one document — a
    /// text substitution across the merged file would repoint the other clusters' refs at this alias too.
    /// </summary>
    private static void RewriteSchemaRefs(JsonNode node, Dictionary<string, string> rename)
    {
        if (rename.Count == 0) return;

        switch (node)
        {
            case JsonObject obj:
                foreach (var (key, value) in obj.ToList())
                {
                    if (key == "$ref"
                        && value?.GetValue<string>() is { } reference
                        && SchemaName(reference) is { } name
                        && rename.TryGetValue(name, out var alias))
                    {
                        obj[key] = $"#/components/schemas/{alias}";
                    }
                    else if (value is not null)
                    {
                        RewriteSchemaRefs(value, rename);
                    }
                }

                break;
            case JsonArray array:
                foreach (var value in array.Where(v => v is not null)) RewriteSchemaRefs(value!, rename);
                break;
        }
    }

    private static IEnumerable<JsonObject> Operations(JsonObject paths) =>
        paths.Select(p => p.Value).OfType<JsonObject>()
            .SelectMany(item => item.Select(v => v.Value))
            .OfType<JsonObject>()
            .Where(node => node.ContainsKey("responses"));

    private static string? SchemaName(string reference) =>
        reference.StartsWith(RefPrefix, StringComparison.Ordinal) ? reference[RefPrefix.Length..] : null;

    private static string Pascal(string cluster)
    {
        var bare = cluster.Replace("-api", string.Empty, StringComparison.Ordinal);
        return char.ToUpperInvariant(bare[0]) + bare[1..];
    }

    private static JsonObject ReadEmbedded(string resource)
    {
        using var stream = typeof(UpstreamSpecMerger).Assembly.GetManifestResourceStream(resource)
            ?? throw new InvalidOperationException($"Embedded resource {resource} is missing.");
        return JsonNode.Parse(stream)?.AsObject()
            ?? throw new InvalidOperationException($"{resource} is not a JSON object.");
    }

    private const string RefPrefix = "#/components/schemas/";
}
