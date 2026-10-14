using System.Security.Claims;
using BurgerHouse.Api.Images;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Api.Controllers;

[ApiController]
[Route("api/admin/products")]
[Authorize(Policy = "Owner")]
[AutoValidateAntiforgeryToken]
public sealed class ProductImagesAdminController(
    ProductImageStorage storage,
    ProductImageAssignmentService assignment,
    BurgerHouseDbContext db,
    TimeProvider clock,
    ILogger<ProductImagesAdminController> logger)
    : ControllerBase
{
    [HttpPost("{id:int:min(1)}/image")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(6291456)]
    [RequestFormLimits(MultipartBodyLengthLimit = 5505024)]
    public async Task<IActionResult> Upload(
        int id,
        [FromForm] IFormFile? file,
        CancellationToken ct)
    {
        if (file is null ||
            file.Length <= 0 ||
            file.Length > ProductImageStorage.MaximumFileSize)
            return BadRequest(new
            {
                error = "Selecione uma imagem de ate 5 MB."
            });

        if (file.ContentType is not (
            "image/jpeg" or "image/png" or "image/webp"))
            return BadRequest(new
            {
                error = "Use JPG, PNG ou WebP."
            });

        if (!await db.Products.AsNoTracking()
                .AnyAsync(p => p.Id == id, ct))
            return NotFound(new
            {
                error = "Produto nao encontrado."
            });

        var adminId = int.Parse(
            User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        string url;

        try
        {
            await using var source = file.OpenReadStream();

            url = await storage.SaveAsync(
                source,
                file.Length,
                ct);
        }
        catch (ArgumentException)
        {
            return BadRequest(new
            {
                error = "Arquivo invalido."
            });
        }
        catch (InvalidDataException)
        {
            return BadRequest(new
            {
                error = "Imagem invalida ou nao suportada."
            });
        }

        string? anterior;

        try
        {
            anterior = await assignment.SetImageAsync(
                id,
                url,
                adminId,
                clock.GetUtcNow().UtcDateTime,
                ct);
        }
        catch (KeyNotFoundException)
        {
            storage.Delete(url);

            return NotFound(new
            {
                error = "Produto nao encontrado."
            });
        }
        catch
        {
            try
            {
                storage.Delete(url);
            }
            catch (IOException ex)
            {
                logger.LogWarning(
                    ex,
                    "Could not delete image after database failure.");
            }

            throw;
        }

        await DeleteUnused(anterior, ct);

        return Ok(new { imageUrl = url });
    }

    [HttpDelete("{id:int:min(1)}/image")]
    public async Task<IActionResult> Remove(
        int id,
        CancellationToken ct)
    {
        var adminId = int.Parse(
            User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        string? anterior;

        try
        {
            anterior = await assignment.SetImageAsync(
                id,
                null,
                adminId,
                clock.GetUtcNow().UtcDateTime,
                ct);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new
            {
                error = "Produto nao encontrado."
            });
        }

        await DeleteUnused(anterior, ct);

        return NoContent();
    }

    private async Task DeleteUnused(
        string? imageUrl,
        CancellationToken ct)
    {
        if (imageUrl is null)
            return;

        if (await db.Products.AsNoTracking()
                .AnyAsync(p => p.ImageUrl == imageUrl, ct))
            return;

        try
        {
            storage.Delete(imageUrl);
        }
        catch (IOException ex)
        {
            logger.LogWarning(
                ex,
                "Could not delete unreferenced product image.");
        }
    }
}