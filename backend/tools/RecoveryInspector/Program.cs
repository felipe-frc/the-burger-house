using System.Reflection;
using System.Reflection.Emit;
using System.Reflection.Metadata;
using System.Reflection.Metadata.Ecma335;
using System.Reflection.PortableExecutable;
using System.Security.Cryptography;
using System.Text.Json;

if (args.Length == 0) throw new ArgumentException("Pass the published API and, optionally, Infrastructure DLL paths.");
var opcodes = typeof(OpCodes).GetFields(BindingFlags.Public | BindingFlags.Static)
    .Where(f => f.FieldType == typeof(OpCode)).Select(f => (OpCode)f.GetValue(null)!)
    .ToDictionary(op => unchecked((ushort)op.Value));
var results = new List<object>();
foreach (var argument in args)
{
    var path = Path.GetFullPath(argument);
    using var stream = File.OpenRead(path);
    using var pe = new PEReader(stream);
    var metadata = pe.GetMetadataReader();
    var candidates = new List<object>();
    var migrations = new List<string>();
    foreach (var typeHandle in metadata.TypeDefinitions)
    {
        var type = metadata.GetTypeDefinition(typeHandle);
        foreach (var attributeHandle in type.GetCustomAttributes())
        {
            var attribute = metadata.GetCustomAttribute(attributeHandle);
            if (!MethodName(attribute.Constructor).Contains("MigrationAttribute::.ctor", StringComparison.Ordinal)) continue;
            var blob = metadata.GetBlobReader(attribute.Value);
            if (blob.ReadUInt16() == 1 && blob.ReadSerializedString() is { } id) migrations.Add(id);
        }
        foreach (var methodHandle in type.GetMethods())
        {
            var method = metadata.GetMethodDefinition(methodHandle);
            if (method.RelativeVirtualAddress == 0) continue;
            var il = pe.GetMethodBody(method.RelativeVirtualAddress).GetILBytes()!;
            var calls = new List<(int Offset, string Name)>();
            for (var offset = 0; offset < il.Length;)
            {
                var instruction = offset;
                ushort value = il[offset++];
                if (value == 0xfe) value = (ushort)(0xfe00 | il[offset++]);
                if (!opcodes.TryGetValue(value, out var opcode)) throw new InvalidDataException("Unknown IL opcode.");
                if (opcode.OperandType == OperandType.InlineMethod)
                    calls.Add((instruction, MethodName(MetadataTokens.EntityHandle(BitConverter.ToInt32(il, offset)))));
                offset += opcode.OperandType switch
                {
                    OperandType.InlineNone => 0,
                    OperandType.ShortInlineBrTarget or OperandType.ShortInlineI or OperandType.ShortInlineVar => 1,
                    OperandType.InlineVar => 2,
                    OperandType.InlineI8 or OperandType.InlineR => 8,
                    OperandType.InlineSwitch => 4 + 4 * BitConverter.ToInt32(il, offset),
                    _ => 4
                };
            }
            var reset = calls.Where(c => c.Name.EndsWith("AdminSecurity::ResetOwnerPasswordAsync", StringComparison.Ordinal)).ToArray();
            var migrate = calls.Where(c => c.Name.EndsWith("RelationalDatabaseFacadeExtensions::Migrate", StringComparison.Ordinal)).ToArray();
            if (reset.Length == 1 && migrate.Length == 1)
                candidates.Add(new { type = TypeName(typeHandle), method = metadata.GetString(method.Name), resetOffset = reset[0].Offset,
                    migrationOffset = migrate[0].Offset, ordering = reset[0].Offset < migrate[0].Offset ? "reset-before-migrations" : "migrations-before-reset" });
        }
    }
    results.Add(new { file = path, sha256 = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path))), recoveryEntryPoints = candidates,
        migrationIds = migrations.Order().ToArray(), executedApplication = false });

    string TypeName(EntityHandle handle) => handle.Kind switch
    {
        HandleKind.TypeReference => metadata.GetString(metadata.GetTypeReference((TypeReferenceHandle)handle).Namespace) + "." + metadata.GetString(metadata.GetTypeReference((TypeReferenceHandle)handle).Name),
        HandleKind.TypeDefinition => metadata.GetString(metadata.GetTypeDefinition((TypeDefinitionHandle)handle).Namespace) + "." + metadata.GetString(metadata.GetTypeDefinition((TypeDefinitionHandle)handle).Name),
        _ => handle.Kind.ToString()
    };
    string MethodName(EntityHandle handle)
    {
        if (handle.Kind == HandleKind.MethodSpecification) return MethodName(metadata.GetMethodSpecification((MethodSpecificationHandle)handle).Method);
        if (handle.Kind == HandleKind.MemberReference)
        {
            var member = metadata.GetMemberReference((MemberReferenceHandle)handle);
            return TypeName(member.Parent) + "::" + metadata.GetString(member.Name);
        }
        if (handle.Kind == HandleKind.MethodDefinition)
        {
            var method = metadata.GetMethodDefinition((MethodDefinitionHandle)handle);
            return TypeName(method.GetDeclaringType()) + "::" + metadata.GetString(method.Name);
        }
        return handle.Kind.ToString();
    }
}
Console.WriteLine(JsonSerializer.Serialize(results, new JsonSerializerOptions { WriteIndented = true }));
