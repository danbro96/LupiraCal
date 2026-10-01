using LupiraCalBff.Dtos;
using LupiraCalBff.Upstream.Contact;
using LupiraCalBff.Upstream.Contact.Models;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Kiota.Abstractions;

namespace LupiraCalBff.Handlers;

public static class ContactContextHandler
{
    public static async Task<Results<Ok<ContactContextDto>, NotFound, ForbidHttpResult>> Handle(
        Guid id, ContactApiClient contacts, CancellationToken cancellationToken)
    {
        // Groups span every readable book (membership is cross-book), so none of these reads waits on another.
        var contactTask = contacts.Contacts[id].GetAsync(cancellationToken: cancellationToken);
        var containersTask = contacts.Sync.Containers.GetAsync(cancellationToken: cancellationToken);
        ContactDto? contact;
        try
        {
            contact = await contactTask;
        }
        catch (ApiException upstream) when (upstream.ResponseStatusCode is 404 or 403)
        {
            // The generated client throws where the proxy passed the status through, so map the two
            // the caller is meant to see. Anything else stays a 500 — it is our bug, not theirs.
            return upstream.ResponseStatusCode == 404 ? TypedResults.NotFound() : TypedResults.Forbid();
        }

        if (contact is null) return TypedResults.NotFound();

        var namesTask = ResolveNames(contact.EmergencyContactIds ?? [], contacts, cancellationToken);
        var containers = await containersTask;
        var writable = (containers?.AddressBooks ?? [])
            .Where(b => b.Access is Access.Owner or Access.ReadWrite)
            .Select(b => b.Id)
            .ToHashSet();
        var groups = containers?.Groups ?? [];
        var isMember = (ContactGroupDto group) => group.Members?.Any(m => m.ContactId == id) == true;

        return TypedResults.Ok(new ContactContextDto
        {
            MemberOf = [.. groups.Where(isMember).Select(Ref)],
            Joinable = [.. groups.Where(g => !isMember(g) && writable.Contains(g.AddressBookId)).Select(Ref)],
            EmergencyContacts = await namesTask,
        });
    }

    private static ContactGroupRefDto Ref(ContactGroupDto group) => new()
    {
        Id = group.Id ?? Guid.Empty,
        Name = group.Name ?? string.Empty,
        Kind = group.Kind?.ToString() ?? string.Empty,
    };

    /// <summary>
    /// One read per emergency contact, in parallel. They can sit in another address book, so a single
    /// book-wide search would not resolve them all — and there are only ever a handful.
    /// </summary>
    private static async Task<IReadOnlyList<ContactRefDto>> ResolveNames(
        List<Guid?> ids, ContactApiClient contacts, CancellationToken cancellationToken)
    {
        var resolved = await Task.WhenAll(ids.Where(i => i is not null).Select(async i =>
        {
            var contactId = i!.Value;
            try
            {
                var contact = await contacts.Contacts[contactId].GetAsync(cancellationToken: cancellationToken);
                return new ContactRefDto { Id = contactId, Name = Name(contact, contactId) };
            }
            catch (ApiException)
            {
                // Unreadable or deleted: the pane showed a truncated id here before, so keep doing that
                // rather than failing the whole panel.
                return new ContactRefDto { Id = contactId, Name = Fallback(contactId) };
            }
        }));

        return resolved;
    }

    private static string Name(ContactDto? contact, Guid id) =>
        string.IsNullOrWhiteSpace(contact?.DisplayName) ? Fallback(id) : contact.DisplayName;

    private static string Fallback(Guid id) => id.ToString()[..8];
}
