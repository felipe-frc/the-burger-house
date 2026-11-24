using System.Globalization;

namespace BurgerHouse.Domain.Entities;

public sealed class AdminAgendaEvent
{
    public static readonly string[] Categories = ["Operação", "Estoque", "Fornecedores", "Equipe", "Manutenção", "Administrativo", "Outros"];
    private AdminAgendaEvent() { }
    public string Id { get; private set; } = "";
    public string Title { get; private set; } = "";
    public string Description { get; private set; } = "";
    public string Date { get; private set; } = "";
    public string StartTime { get; private set; } = "";
    public string EndTime { get; private set; } = "";
    public string Category { get; private set; } = "";
    public string Status { get; private set; } = "pending";
    public string Notes { get; private set; } = "";
    public int Revision { get; private set; }
    public bool Deleted { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    public AdminAgendaEvent(string id, string title, string description, string date, string startTime,
        string endTime, string category, string status, string notes, DateTime now)
    {
        if (string.IsNullOrWhiteSpace(id) || id.Length > 100 || id.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '-'))
            throw new ArgumentException("Invalid event identifier.");
        Id = id;
        CreatedAt = now;
        Update(title, description, date, startTime, endTime, category, status, notes, now);
    }

    public void Update(string title, string description, string date, string startTime,
        string endTime, string category, string status, string notes, DateTime now)
    {
        if (Deleted) throw new InvalidOperationException("Event was removed.");
        if (!DateOnly.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _) ||
            !TimeOnly.TryParseExact(startTime, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var start) ||
            !TimeOnly.TryParseExact(endTime, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var end) || end <= start)
            throw new ArgumentException("Invalid event period.");
        if (!Categories.Contains(category) || status is not ("pending" or "completed"))
            throw new ArgumentException("Invalid event classification.");
        if (now.Kind != DateTimeKind.Utc) throw new ArgumentException("UTC timestamp required.");
        Title = Text(title, 200, true);
        Description = Text(description, 2000);
        Notes = Text(notes, 2000);
        Date = date;
        StartTime = startTime;
        EndTime = endTime;
        Category = category;
        Status = status;
        UpdatedAt = now;
        Revision++;
    }

    public void Delete(DateTime now)
    {
        if (Deleted) throw new InvalidOperationException("Event was removed.");
        Deleted = true;
        UpdatedAt = now;
        Revision++;
    }

    private static string Text(string? value, int maximum, bool required = false)
    {
        var text = value?.Trim() ?? "";
        if (text.Length > maximum || (required && text.Length == 0)) throw new ArgumentException("Invalid event text.");
        return text;
    }
}
