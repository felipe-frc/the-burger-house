using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Text.Json;
using BurgerHouse.Api.Security;
using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Persistence;
using BurgerHouse.Infrastructure.Privacy;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Api.Privacy;

public sealed class PrivacyOptions
{
    public bool RequestsEnabled { get; set; }
    public string? ControllerName { get; set; }
    public string? BusinessId { get; set; }
    public string? BusinessAddress { get; set; }
    public string? PrivacyContact { get; set; }
    public string? RetentionPolicyVersion { get; set; }
    public bool Ready => RequestsEnabled && !string.IsNullOrWhiteSpace(ControllerName) &&
        !string.IsNullOrWhiteSpace(PrivacyContact) && !string.IsNullOrWhiteSpace(RetentionPolicyVersion);
}
public sealed record ContactCorrection([StringLength(120)] string Name,
    [StringLength(25)] string Phone, [StringLength(254), EmailAddress] string Email);
public sealed record SubmitPrivacyRequest(Guid Id, int OrderId, [StringLength(24)] string Kind, ContactCorrection? Correction);
public sealed record ReviewPrivacyRequest(long Revision, [StringLength(32)] string Action,
    bool RetentionReviewed, [StringLength(24)] string? Confirmation);

public sealed class PrivacyService(PrivacyDbContext privacy, BurgerHouseDbContext operational,
    IPersonalDataProtector protector, TimeProvider clock, IOptions<PrivacyOptions> options)
{
    private const string Purpose = "privacy-request-correction-v1";
    public static readonly string[] Kinds = ["access", "correction", "erasure", "revoke", "information", "portability", "objection", "review"];
    public async Task<bool> Available(CancellationToken ct)
    {
        if (!options.Value.Ready) return false;
        try { return !(await privacy.Database.GetPendingMigrationsAsync(ct)).Any(); }
        catch (System.Data.Common.DbException) { return false; }
    }
    public static object Status(PrivacyRequest request) => new {
        request.Id, request.OrderId, request.Kind, request.State, request.CreatedAt, request.ReviewedAt, request.Decision, request.Revision,
    };
    public async Task<PrivacyRequest> Submit(SubmitPrivacyRequest command, CancellationToken ct)
    {
        if (command.Id == Guid.Empty || command.OrderId < 1 || !Kinds.Contains(command.Kind) ||
            (command.Kind == "correction") != (command.Correction is not null)) throw new ArgumentException("Solicitação inválida.");
        if (command.Correction is not null) Validate(command.Correction);
        var existing = await privacy.Requests.FindAsync([command.Id], ct);
        if (existing is not null) {
            if (existing.OrderId != command.OrderId || existing.Kind != command.Kind) throw new InvalidOperationException("Protocolo já utilizado.");
            return existing; // An idempotency key never replaces an earlier request body.
        }
        if (!await operational.Orders.AnyAsync(x => x.Id == command.OrderId, ct)) throw new KeyNotFoundException();
        var request = new PrivacyRequest {
            Id = command.Id, OrderId = command.OrderId, Kind = command.Kind,
            CreatedAt = clock.GetUtcNow().UtcDateTime,
            EncryptedCorrection = command.Correction is null ? null : protector.Protect(JsonSerializer.Serialize(command.Correction), Purpose),
        };
        privacy.Requests.Add(request);
        await privacy.SaveChangesAsync(ct);
        return request;
    }
    internal static void Validate(ContactCorrection contact)
    {
        if (string.IsNullOrWhiteSpace(contact.Name) || contact.Name.Length > 120 || contact.Name.Any(char.IsControl) ||
            string.IsNullOrWhiteSpace(contact.Phone) || contact.Phone.Length > 25 ||
            contact.Phone.Count(char.IsAsciiDigit) is < 10 or > 15 || contact.Phone.Any(x => !char.IsAsciiDigit(x) && !" +-()".Contains(x)) ||
            !new EmailAddressAttribute().IsValid(contact.Email) || contact.Email.Length > 254)
            throw new ArgumentException("Contato inválido.");
    }
    public ContactCorrection? Correction(PrivacyRequest request) => request.EncryptedCorrection is null ? null :
        JsonSerializer.Deserialize<ContactCorrection>(protector.Unprotect(request.EncryptedCorrection, Purpose)!);
    public async Task Review(Guid id, ReviewPrivacyRequest command, int owner, CancellationToken ct)
    {
        await using var tx = await privacy.Database.BeginTransactionAsync(ct);
        await operational.Database.UseTransactionAsync(tx.GetDbTransaction(), ct);
        try {
        var orderId = await privacy.Requests.AsNoTracking().Where(x => x.Id == id).Select(x => (int?)x.OrderId).SingleOrDefaultAsync(ct) ?? throw new KeyNotFoundException();
        if (privacy.Database.IsNpgsql())
            await privacy.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(1662, {orderId})", ct);
        var request = await privacy.Requests.SingleAsync(x => x.Id == id, ct);
        if (request.Revision != command.Revision || request.State is not ("Received" or "Retained")) throw new DbUpdateConcurrencyException();
        if (command.Action is not ("ProvideInformation" or "ApplyCorrection" or "MinimizeContact" or "RetainForReview"))
            throw new ArgumentException("Decisão inválida.");
        if (command.Action is "ApplyCorrection" or "MinimizeContact") {
            if (!command.RetentionReviewed) throw new ArgumentException("Revisão de retenção obrigatória.");
            var order = await operational.Orders.Include(x => x.Items).SingleAsync(x => x.Id == request.OrderId, ct);
            if (order.Status is not (OrderStatus.Completed or OrderStatus.Cancelled) ||
                await operational.Payments.AnyAsync(x => x.OrderId == order.Id && (x.Status == PaymentStatus.Pending || x.Status == PaymentStatus.ChargedBack), ct))
                throw new InvalidOperationException("Pedido ativo, pagamento pendente ou contestação: revisão manual necessária.");
            if (command.Action == "ApplyCorrection") {
                if (request.Kind != "correction" || request.EncryptedCorrection is null) throw new ArgumentException("Correção não solicitada.");
                var corrected = JsonSerializer.Deserialize<ContactCorrection>(protector.Unprotect(request.EncryptedCorrection, Purpose)!)!;
                Validate(corrected); order.CorrectPrivacyContact(corrected.Name, corrected.Phone, corrected.Email);
            } else {
                if (request.Kind != "erasure" || command.Confirmation != "MINIMIZAR") throw new ArgumentException("Confirmação explícita obrigatória.");
                order.MinimizePrivacyContact();
                var related = await privacy.Requests.Where(x => x.OrderId == order.Id).ToListAsync(ct);
                foreach (var item in related) { item.EncryptedCorrection = null; item.Revision++; }
            }
            await operational.SaveChangesAsync(ct);
        }
        request.State = command.Action == "RetainForReview" ? "Retained" : "Processed";
        request.Decision = command.Action; request.ReviewedBy = owner; request.ReviewedAt = clock.GetUtcNow().UtcDateTime; request.Revision++;
        privacy.Decisions.Add(new PrivacyDecision { Id = Guid.NewGuid(), RequestId = request.Id, OwnerId = owner,
            Action = command.Action, CreatedAt = request.ReviewedAt.Value, Revision = request.Revision });
        // Typed decisions are the audit trail; no free-text personal data or before/after snapshots.
        if (command.Action != "RetainForReview") request.EncryptedCorrection = null;
        await privacy.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        } finally { await operational.Database.UseTransactionAsync(null, CancellationToken.None); }
    }
}

[ApiController, Route("api/privacy"), EnableRateLimiting("PrivacyRequests")]
public sealed class PrivacyController(PrivacyService service, PrivacyDbContext privacy, BurgerHouseDbContext operational,
    PublicOrderAccess access, IOptions<PrivacyOptions> options) : ControllerBase
{
    private bool Owns(int id) => access.TryRead(Request, out var order) && order == id;
    [HttpGet("config")]
    public async Task<object> Configuration(CancellationToken ct) => new {
        requestsEnabled = await service.Available(ct), options.Value.ControllerName, options.Value.BusinessId,
        options.Value.BusinessAddress, options.Value.PrivacyContact, options.Value.RetentionPolicyVersion, draft = true,
    };
    [HttpPost("requests"), RequestSizeLimit(8192)]
    public async Task<IActionResult> Submit(SubmitPrivacyRequest command, CancellationToken ct)
    {
        if (!Owns(command.OrderId)) return NotFound();
        if (!await service.Available(ct)) return StatusCode(503, new { error = "Canal digital ainda não habilitado; consulte o aviso de privacidade." });
        try { return Ok(PrivacyService.Status(await service.Submit(command, ct))); }
        catch (ArgumentException) { return BadRequest(new { error = "Solicitação inválida." }); }
        catch (InvalidOperationException) { return Conflict(new { error = "Protocolo já utilizado." }); }
        catch (DbUpdateException) { return Conflict(new { error = "Recarregue o protocolo antes de tentar novamente." }); }
    }
    [HttpGet("requests/{id:guid}")]
    public async Task<IActionResult> Status(Guid id, CancellationToken ct)
    {
        if (!access.TryRead(Request, out var order)) return NotFound();
        if (!await service.Available(ct)) return StatusCode(503);
        var request = await privacy.Requests.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.OrderId == order, ct);
        return request is null ? NotFound() : Ok(PrivacyService.Status(request));
    }
    [HttpGet("orders/{id:int}/export")]
    public async Task<IActionResult> Export(int id, CancellationToken ct)
    {
        if (!Owns(id)) return NotFound();
        if (!await service.Available(ct)) return StatusCode(503);
        var order = await operational.Orders.AsNoTracking().Include(x => x.Items).SingleOrDefaultAsync(x => x.Id == id, ct);
        if (order is null) return NotFound();
        Response.Headers.CacheControl = "no-store, private";
        return Ok(new { order.Id, order.CreatedAt, order.OrderType, order.CustomerName, order.CustomerPhone, order.CustomerEmail,
            order.CustomerTaxId, order.ZipCode, order.Street, order.HouseNumber, order.Neighborhood, order.City, order.Complement,
            order.Observation, order.Total, items = order.Items.Select(x => new { x.ProductId, x.Quantity, x.UnitPrice, x.Observation }) });
    }
}

[ApiController, Route("api/admin/privacy"), Authorize(Policy = "Owner"), AutoValidateAntiforgeryToken]
public sealed class AdminPrivacyController(PrivacyService service, PrivacyDbContext privacy) : ControllerBase
{
    [HttpGet("requests/{id:guid}")]
    public async Task<IActionResult> Detail(Guid id, CancellationToken ct)
    {
        if (!await service.Available(ct)) return StatusCode(503);
        var request = await privacy.Requests.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (request is null) return NotFound();
        var decisions = await privacy.Decisions.AsNoTracking().Where(x => x.RequestId == id).OrderBy(x => x.CreatedAt)
            .Select(x => new { x.Action, x.OwnerId, x.CreatedAt, x.Revision }).ToListAsync(ct);
        return Ok(new { request = PrivacyService.Status(request), correction = service.Correction(request), decisions });
    }
    [HttpGet("requests")]
    public async Task<IActionResult> Requests([Range(1, 1000000)] int page = 1, CancellationToken ct = default)
    {
        if (!await service.Available(ct)) return StatusCode(503, new { error = "Módulo de privacidade não habilitado; configuração e migration próprias pendentes." });
        var total = await privacy.Requests.CountAsync(ct);
        var rows = await privacy.Requests.AsNoTracking().OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * 20).Take(20).ToListAsync(ct);
        return Ok(new { total, page, pageSize = 20, items = rows.Select(PrivacyService.Status) });
    }
    [HttpPost("requests/{id:guid}/review")]
    public async Task<IActionResult> Review(Guid id, ReviewPrivacyRequest command, CancellationToken ct)
    {
        if (!await service.Available(ct)) return StatusCode(503);
        if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var owner)) return Forbid();
        try { await service.Review(id, command, owner, ct); return NoContent(); }
        catch (KeyNotFoundException) { return NotFound(); }
        catch (ArgumentException) { return BadRequest(new { error = "Decisão inválida ou confirmação ausente." }); }
        catch (InvalidOperationException) { return Conflict(new { error = "Pedido exige revisão de retenção ou ainda está em operação." }); }
        catch (DbUpdateConcurrencyException) { return Conflict(new { error = "Solicitação alterada por outro operador. Recarregue." }); }
    }
}
