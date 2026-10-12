using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using BurgerHouse.Api.Admin;
using BurgerHouse.Application.Admin;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace BurgerHouse.Api.Controllers;

[ApiController, Route("api/admin/auth"), Authorize(Policy = "Owner"), AutoValidateAntiforgeryToken]
public sealed class AdminAuthController(IAdminIdentity identity, IAntiforgery antiforgery, TimeProvider clock, AdminLoginProtection protection) : ControllerBase
{
    [AllowAnonymous, HttpGet("login")]
    public IActionResult LoginToken() => Ok(new { csrfToken = antiforgery.GetAndStoreTokens(HttpContext).RequestToken });

    [AllowAnonymous, HttpPost("login"), EnableRateLimiting("OwnerLogin")]
    public async Task<IActionResult> Login(LoginRequest request, CancellationToken ct)
    {
        var owner = await protection.AuthenticateAsync(HttpContext.Connection.RemoteIpAddress, request.Email,
            () => identity.AuthenticateAsync(request.Email, request.Password, ct), ct);
        if (owner is null) return Unauthorized(new { error = "Credenciais inválidas." });
        var expires = clock.GetUtcNow().AddHours(8);
        var session = await identity.CreateSessionAsync(owner.Id, expires.UtcDateTime, ct);
        var principal = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, owner.Id.ToString()),
            new Claim(ClaimTypes.Role, "Owner"), new Claim("session", session)
        }, AdminSecurity.Scheme));
        await HttpContext.SignInAsync(AdminSecurity.Scheme, principal, new AuthenticationProperties
        {
            IsPersistent = true, ExpiresUtc = expires, AllowRefresh = false
        });
        return Ok(new { role = "Owner" });
    }
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request, CancellationToken ct)
    {
        var ownerId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var changed = await identity.ChangePasswordAsync(
            ownerId,
            request.CurrentPassword,
            request.NewPassword,
            ct);

        if (!changed)
            return Unauthorized(new { error = "Senha atual inválida." });

        await HttpContext.SignOutAsync(AdminSecurity.Scheme);

        return NoContent();
    }

    [HttpGet("me")]
    public IActionResult Me() => Ok(new { role = "Owner", csrfToken = antiforgery.GetAndStoreTokens(HttpContext).RequestToken });
    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        await identity.RevokeSessionAsync(User.FindFirstValue("session")!, ct);
        await HttpContext.SignOutAsync(AdminSecurity.Scheme);
        return NoContent();
    }
}
public sealed record LoginRequest([Required, StringLength(254)] string Email, [Required, StringLength(128)] string Password);
public sealed record ChangePasswordRequest(
    [Required, StringLength(128)] string CurrentPassword,
    [Required, StringLength(128, MinimumLength = 14)] string NewPassword);
