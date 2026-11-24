using BurgerHouse.Domain.Entities;

namespace BurgerHouse.Domain.Tests;

public sealed class AdminAgendaEventTests
{
    [Theory]
    [InlineData("2026-02-30", "09:00", "10:00", "Operação", "pending")]
    [InlineData("2026-11-16", "10:00", "09:00", "Operação", "pending")]
    [InlineData("2026-11-16", "09:00", "09:00", "Operação", "pending")]
    [InlineData("2026-11-16", "9:00", "10:00", "Operação", "pending")]
    [InlineData("2026-11-16", "09:00", "10:00", "Inventada", "pending")]
    [InlineData("2026-11-16", "09:00", "10:00", "Operação", "unknown")]
    public void RejectsInvalidDatesAndClassification(string date, string start, string end, string category, string status) =>
        Assert.Throws<ArgumentException>(() => new AdminAgendaEvent("test-id", "Reunião", "", date, start, end, category, status, "", DateTime.UtcNow));

    [Fact]
    public void DeletedEventCannotBeUpdatedOrImportedAgain()
    {
        var entity = new AdminAgendaEvent("test-id", "Reunião", "", "2026-11-16", "09:00", "10:00", "Operação", "pending", "", DateTime.UtcNow);
        entity.Delete(DateTime.UtcNow);
        Assert.Equal(2, entity.Revision);
        Assert.Throws<InvalidOperationException>(() => entity.Update("Reunião", "", "2026-11-16", "09:00", "10:00", "Operação", "pending", "", DateTime.UtcNow));
    }
}
