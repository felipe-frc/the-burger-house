using System.Net.Mail;

namespace BurgerHouse.Domain.Entities;

public sealed class TeamMember
{
    public static readonly string[] Roles = ["Atendente", "Chapeiro", "Chef de Cozinha", "Entregador", "Gerente", "Administrador"];
    public static readonly string[] Departments = ["Atendimento", "Cozinha", "Logística", "Administração"];
    public int Id { get; private set; }
    public string Name { get; private set; } = "";
    public string Email { get; private set; } = "";
    public string Role { get; private set; } = "";
    public string Department { get; private set; } = "";
    public string Shift { get; private set; } = "";
    public bool Active { get; private set; }
    public int Revision { get; private set; } = 1;

    private TeamMember() { }
    public TeamMember(string name, string email, string role, string department, string shift)
    {
        SetFields(name, email, role, department, shift);
        Active = true;
    }

    public void Update(int expectedRevision, string name, string email, string role, string department, string shift, bool active)
    {
        if (expectedRevision != Revision) throw new InvalidOperationException("Stale team revision.");
        SetFields(name, email, role, department, shift);
        Active = active;
        Revision = checked(Revision + 1);
    }

    private void SetFields(string name, string email, string role, string department, string shift)
    {
        var validName = Required(name, 120);
        var validEmail = Required(email, 254);
        if (validName.Length < 2 || !MailAddress.TryCreate(validEmail, out var address) || address.Address != validEmail)
            throw new ArgumentException("Invalid name or email.");
        if (!Roles.Contains(role) || !Departments.Contains(department)) throw new ArgumentException("Invalid role or department.");
        var validShift = Required(shift, 120);
        Name = validName;
        Email = validEmail;
        Role = role;
        Department = department;
        Shift = validShift;
    }

    private static string Required(string? value, int maximum)
    {
        var result = value?.Trim();
        if (string.IsNullOrEmpty(result) || result.Length > maximum || result.Any(char.IsControl))
            throw new ArgumentException("Invalid team field.");
        return result;
    }
}
