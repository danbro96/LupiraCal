# syntax=docker/dockerfile:1
# Single-image BFF: build the Vite SPA, then publish the .NET app with the SPA served from wwwroot.
# Build context = repo root.

# --- SPA build ---
FROM node:24-alpine AS client
WORKDIR /repo
COPY package.json package-lock.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/domain/package.json packages/domain/
COPY packages/tokens/package.json packages/tokens/
COPY packages/api/package.json packages/api/
COPY apps/mobile/package.json apps/mobile/
# Web workspaces only — the mobile app's Expo tree has no business in this image.
RUN npm i -g npm@12
RUN --mount=type=secret,id=packages_token,env=PACKAGES_TOKEN npm ci -w apps/web -w packages/domain -w packages/tokens -w packages/api --include-workspace-root
COPY packages/domain/ packages/domain/
COPY packages/tokens/ packages/tokens/
COPY packages/api/ packages/api/
COPY apps/web/ apps/web/
RUN npm run build -w apps/web -- --outDir dist --emptyOutDir

# --- backend publish ---
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY nuget.config ./
COPY src/LupiraCalBff/ ./LupiraCalBff/
WORKDIR /src/LupiraCalBff
ARG BUILD_CONFIGURATION=Release
RUN --mount=type=secret,id=packages_token,env=PACKAGES_TOKEN dotnet restore "./LupiraCalBff.csproj"
RUN dotnet publish "./LupiraCalBff.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false
COPY --from=client /repo/apps/web/dist /app/publish/wwwroot

# --- runtime ---
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

# Data-protection key ring — mount a volume here so the auth cookie survives container restarts.
RUN mkdir -p /keys && chown app:app /keys

ENV ASPNETCORE_URLS=http://+:80
COPY --from=build /app/publish .
USER app

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:80/livez || exit 1
ENTRYPOINT ["dotnet", "LupiraCalBff.dll"]
