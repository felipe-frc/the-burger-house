# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src

COPY ["backend/BurgerHouse.Domain/BurgerHouse.Domain.csproj", "backend/BurgerHouse.Domain/"]
COPY ["backend/BurgerHouse.Application/BurgerHouse.Application.csproj", "backend/BurgerHouse.Application/"]
COPY ["backend/BurgerHouse.Infrastructure/BurgerHouse.Infrastructure.csproj", "backend/BurgerHouse.Infrastructure/"]
COPY ["backend/BurgerHouse.Api/BurgerHouse.Api.csproj", "backend/BurgerHouse.Api/"]
RUN dotnet restore "backend/BurgerHouse.Api/BurgerHouse.Api.csproj"

COPY backend/ backend/
RUN dotnet publish "backend/BurgerHouse.Api/BurgerHouse.Api.csproj" \
    --configuration "$BUILD_CONFIGURATION" \
    --output /app/publish \
    --no-restore \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app

ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_FORWARDEDHEADERS_ENABLED=true \
    DOTNET_EnableDiagnostics=0

EXPOSE 8080

COPY --from=build /app/publish .

ENTRYPOINT ["sh", "-c", "exec dotnet BurgerHouse.Api.dll --urls http://0.0.0.0:${PORT:-8080}"]
