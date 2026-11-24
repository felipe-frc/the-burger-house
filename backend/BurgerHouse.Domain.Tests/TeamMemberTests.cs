using BurgerHouse.Domain.Entities;

namespace BurgerHouse.Domain.Tests;

public sealed class TeamMemberTests
{
    [Fact]
    public void UpdateRequiresCurrentRevisionAndPreservesPreviousDataOnInvalidInput()
    {
        var member = new TeamMember("Maria Teste", "team@example.invalid", "Atendente", "Atendimento", "18:00 - 23:00");
        member.Update(1, "Maria Teste", "team@example.invalid", "Gerente", "Administração", "18:00 - 23:00", false);
        Assert.Equal(2, member.Revision);
        Assert.False(member.Active);
        Assert.Throws<InvalidOperationException>(() => member.Update(1, member.Name, member.Email, member.Role, member.Department, member.Shift, true));
        Assert.Throws<ArgumentException>(() => member.Update(2, "Outro Nome", "invalid", member.Role, member.Department, member.Shift, true));
        Assert.Equal("Maria Teste", member.Name);
        Assert.Equal(2, member.Revision);
    }
    [Theory]
    [InlineData("", "team@example.invalid", "Atendente", "Atendimento", "18:00")]
    [InlineData("Maria Teste", "invalid", "Atendente", "Atendimento", "18:00")]
    [InlineData("Maria Teste", "team@example.invalid", "Owner", "Atendimento", "18:00")]
    [InlineData("Maria Teste", "team@example.invalid", "Atendente", "Unknown", "18:00")]
    public void InvalidFieldsAreRejected(string name, string email, string role, string department, string shift) =>
        Assert.Throws<ArgumentException>(() => new TeamMember(name, email, role, department, shift));
}
