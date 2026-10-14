namespace BurgerHouse.Application.Translations;

public sealed record ProductTranslation(
    string EnglishName,
    string EnglishDescription
);

public interface IProductTranslationService
{
    Task<ProductTranslation> TranslateAsync(
        string name,
        string description,
        CancellationToken cancellationToken
    );
}