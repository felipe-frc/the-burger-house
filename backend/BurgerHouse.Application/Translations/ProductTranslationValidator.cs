using System.Globalization;
using System.Text.RegularExpressions;

namespace BurgerHouse.Application.Translations;

public static class ProductTranslationValidator
{
    private static readonly Regex Quantities = new(
        @"(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?\s*(?:kg|g|mg|ml|l|unidades?|units?|pcs?|oz|lb)?\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    public static bool IsValid(
        string name,
        string description,
        ProductTranslation translation)
    {
        if (string.IsNullOrWhiteSpace(name) ||
            string.IsNullOrWhiteSpace(description) ||
            string.IsNullOrWhiteSpace(translation.EnglishName) ||
            string.IsNullOrWhiteSpace(translation.EnglishDescription))
            return false;

        if (translation.EnglishName.Length > 150 ||
            translation.EnglishDescription.Length > 500)
            return false;

        return SameQuantities(name, translation.EnglishName) &&
               SameQuantities(description, translation.EnglishDescription);
    }

    private static bool SameQuantities(
        string original,
        string translated)
    {
        static string Normalize(string value) =>
            Regex.Replace(
                value.ToLowerInvariant().Replace(',', '.'),
                @"\s+",
                "");

        var originals = Quantities.Matches(original)
            .Select(match => Normalize(match.Value))
            .OrderBy(value => value, StringComparer.Ordinal)
            .ToArray();

        var translations = Quantities.Matches(translated)
            .Select(match => Normalize(match.Value))
            .OrderBy(value => value, StringComparer.Ordinal)
            .ToArray();

        return originals.SequenceEqual(
            translations,
            StringComparer.Ordinal);
    }
}