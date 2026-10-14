using BurgerHouse.Api.Images;
using Microsoft.AspNetCore.Mvc;

namespace BurgerHouse.Api.Controllers;

[ApiController]
[Route("api/product-images")]
public sealed class ProductImagesController(
    ProductImageStorage storage)
    : ControllerBase
{
    [HttpGet("{filename}")]
    [ResponseCache(
        Duration = 86400,
        Location = ResponseCacheLocation.Any)]
    public IActionResult Get(string filename)
    {
        var stream = storage.OpenRead(filename);

        if (stream is null)
            return NotFound();

        return File(stream, "image/webp");
    }
}