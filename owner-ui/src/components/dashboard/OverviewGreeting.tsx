import { memo, useEffect, useState } from 'react';
import { overviewGreeting } from '../../services/ownerOverviewAppearance';
import { ownerNow, showcaseEnabled } from '../../services/ownerShowcase';

const LAT = -18.91861;
const LON = -48.27722;
const TIMEZONE = 'America/Sao_Paulo';
const INTERVAL = 15 * 60 * 1000;

type Weather = {
  code: number;
  isDay: boolean;
  temperature: number | null;
};

function getWeatherVisual(weather: Weather) {
  const { code, isDay } = weather;

  if (code === 0) {
    return {
      icon: isDay ? 'clear-day' : 'clear-night',
      label: 'Céu limpo',
    };
  }

  if (code === 1 || code === 2) {
    return {
      icon: isDay ? 'partly-cloudy-day' : 'partly-cloudy-night',
      label: 'Parcialmente nublado',
    };
  }

  if (code === 3) {
    return { icon: 'overcast', label: 'Nublado' };
  }

  if (code === 45 || code === 48) {
    return {
      icon: isDay ? 'fog-day' : 'fog-night',
      label: 'Neblina',
    };
  }

  if (code >= 51 && code <= 57) {
    return { icon: 'drizzle', label: 'Garoa' };
  }

  if (
    (code >= 61 && code <= 67) ||
    (code >= 80 && code <= 82)
  ) {
    return { icon: 'rain', label: 'Chuva' };
  }

  if (
    (code >= 71 && code <= 77) ||
    code === 85 || code === 86
  ) {
    return { icon: 'snow', label: 'Neve' };
  }

  if (code >= 95 && code <= 99) {
    return {
      icon: isDay
        ? 'thunderstorms-day-rain'
        : 'thunderstorms-night-rain',
      label: 'Tempestade',
    };
  }

  return { icon: 'overcast', label: 'Condição variável' };
}

function useCurrentWeather() {
  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;

    const refresh = async () => {
      controller?.abort();

      const currentController = new AbortController();
      controller = currentController;

      try {
        const url = new URL(
          'https://api.open-meteo.com/v1/forecast'
        );

        url.searchParams.set('latitude', String(LAT));
        url.searchParams.set('longitude', String(LON));
        url.searchParams.set(
          'current',
          'weather_code,is_day,temperature_2m'
        );
        url.searchParams.set('timezone', TIMEZONE);

        const response = await fetch(url.toString(), {
          signal: currentController.signal,
        });

        if (!response.ok) {
          throw new Error('Clima indisponível');
        }

        const result = await response.json();
        const current = result.current;

        if (
          !current ||
          !Number.isFinite(current.weather_code) ||
          ![0, 1].includes(current.is_day)
        ) {
          throw new Error('Resposta meteorológica inválida');
        }

        if (active && !currentController.signal.aborted) {
          setWeather({
            code: current.weather_code,
            isDay: current.is_day === 1,
            temperature: Number.isFinite(current.temperature_2m)
              ? current.temperature_2m
              : null,
          });
        }
      } catch (error) {
        if (
          !active ||
          currentController.signal.aborted
        ) return;

        setWeather(null);
      }
    };

    void refresh();

    const timer = window.setInterval(
      () => void refresh(),
      INTERVAL
    );

    const resume = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    };

    document.addEventListener('visibilitychange', resume);

    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);

  return weather;
}

export const OverviewGreeting = memo(function OverviewGreeting() {
  const [now, setNow] = useState(() => ownerNow());
  const weather = useCurrentWeather();

  useEffect(() => {
    if (showcaseEnabled()) return;

    let timer: number;
    const update = () => {
      window.clearTimeout(timer);
      const instant = ownerNow();
      setNow(instant);
      timer = window.setTimeout(update, 60_000 - instant % 60_000);
    };
    update();

    const resume = () => {
      if (document.visibilityState === 'visible') update();
    };

    document.addEventListener('visibilitychange', resume);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);

  const greeting = overviewGreeting(now);

  const descriptions = {
    morning: 'Confira como está sua hamburgueria hoje.',
    afternoon: 'Acompanhe suas vendas e os pedidos em andamento.',
    night: 'Acompanhe o movimento da sua hamburgueria.',
  };

  const period = greeting?.period ?? 'morning';
  const formattedDate = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: TIMEZONE,
  }).format(now);

  const date =
    formattedDate.charAt(0).toUpperCase() +
    formattedDate.slice(1);

  const visual = weather ? getWeatherVisual(weather) : null;

  return (
    <div className="owner-overview-greeting-block"
         data-period={period}>
      <h1 className="owner-title owner-weather-title">
        <span>{greeting?.text ?? 'Olá!'}</span>
        {visual && (
          <picture>
            <source
              media="(prefers-reduced-motion: reduce)"
              srcSet={`/admin/tbh-weather-static/${visual.icon}.svg`}
            />
            <img
              className="owner-weather-icon"
              src={`/admin/tbh-weather/${visual.icon}.svg`}
              width={46}
              height={46}
              alt={`Clima: ${visual.label}`}
              title={`${visual.label}${
                weather?.temperature != null
                  ? ` · ${Math.round(weather.temperature)} °C`
                  : ''
              }`}
            />
          </picture>
        )}
      </h1>

      <p className="owner-overview-greeting-subtitle">
        {date} · {descriptions[period]}
        {visual && (
          <span className="owner-weather-description">
            {' · '}{visual.label}
            {weather?.temperature != null &&
              ` · ${Math.round(weather.temperature)} °C`}
          </span>
        )}
      </p>
    </div>
  );
});
