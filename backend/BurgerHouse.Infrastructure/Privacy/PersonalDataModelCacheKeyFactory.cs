using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace BurgerHouse.Infrastructure.Privacy;

// Converters capture a protector. A context with another protector must never reuse it.
public sealed class PersonalDataModelCacheKeyFactory : IModelCacheKeyFactory
{
    public object Create(DbContext context, bool designTime) => context is BurgerHouseDbContext db
        ? (context.GetType(), db.PersonalDataProtector, designTime)
        : (object)(context.GetType(), designTime);
}
