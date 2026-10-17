import axios from 'axios';
import * as demoData from '../data/demoData';
import { WeatherData, ThermalStressData, RiskAssessment, ForecastData, VulnerabilityData, Alert, DemoScenario, GovernmentDashboard, HistoricalData, MLPrediction } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const api = axios.create({ baseURL: `${API_URL}/api` });

type ApiWeather = {
  temp: number;
  humidity: number;
  wind_speed: number;
  solar_radiation: number;
  timestamp: string;
};

type ApiThermalStress = {
  heat_index: number;
  wbgt: number;
  utci: number;
  htss_score: number;
  contributions: Record<string, number>;
};

type ApiAlert = {
  id: string;
  severity: string;
  title: string;
  message: string;
  timestamp: string;
  recommended_actions: string[];
};

const toWeatherData = (weather: ApiWeather): WeatherData => ({
  temperature: weather.temp,
  humidity: weather.humidity,
  windSpeed: weather.wind_speed,
  solarRadiation: weather.solar_radiation,
  timestamp: weather.timestamp,
});

const toThermalStressData = (thermal: ApiThermalStress): ThermalStressData => ({
  heatIndex: thermal.heat_index,
  wbgt: thermal.wbgt,
  utci: thermal.utci,
  htss: thermal.htss_score,
});

const toAlert = (alert: ApiAlert): Alert => ({
  id: alert.id,
  title: alert.title,
  message: alert.message,
  severity: alert.severity.toLowerCase().split(' ')[0],
  time: new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  actions: alert.recommended_actions,
});

const getOpenMeteoWeather = async (lat: number, lon: number): Promise<WeatherData> => {
  const response = await axios.get<{
    current: {
      temperature_2m: number;
      relative_humidity_2m: number;
      wind_speed_10m: number;
      direct_radiation: number;
      time: string;
    };
  }>('https://api.open-meteo.com/v1/forecast', {
    params: {
      latitude: lat,
      longitude: lon,
      current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,direct_radiation',
      timezone: 'auto',
    },
  });
  return {
    temperature: response.data.current.temperature_2m,
    humidity: response.data.current.relative_humidity_2m,
    windSpeed: response.data.current.wind_speed_10m,
    solarRadiation: response.data.current.direct_radiation,
    timestamp: response.data.current.time,
  };
};

const calculateThermalStress = (weather: WeatherData): ThermalStressData => {
  const temp = weather.temperature;
  const humidity = weather.humidity;
  const tempF = temp * 1.8 + 32;
  let heatIndexF = 0.5 * (tempF + 61 + (tempF - 68) * 1.2 + humidity * 0.094);
  if (heatIndexF >= 80) {
    heatIndexF = -42.379
      + 2.04901523 * tempF
      + 10.14333127 * humidity
      - 0.22475541 * tempF * humidity
      - 0.00683783 * tempF * tempF
      - 0.05481717 * humidity * humidity
      + 0.00122874 * tempF * tempF * humidity
      + 0.00085282 * tempF * humidity * humidity
      - 0.00000199 * tempF * tempF * humidity * humidity;
    if (humidity < 13 && tempF >= 80 && tempF <= 112) {
      heatIndexF -= ((13 - humidity) / 4) * Math.sqrt((17 - Math.abs(tempF - 95)) / 17);
    } else if (humidity > 85 && tempF >= 80 && tempF <= 87) {
      heatIndexF += ((humidity - 85) / 10) * ((87 - tempF) / 5);
    }
  }

  const heatIndex = (heatIndexF - 32) / 1.8;
  const vaporPressure = (humidity / 100) * 6.105 * Math.exp((17.27 * temp) / (237.7 + temp));
  const wbgt = 0.567 * temp + 0.393 * vaporPressure + 3.94
    + (weather.solarRadiation > 100 ? weather.solarRadiation * 0.01 : 0);
  const windMs = weather.windSpeed * 0.27778;
  const meanRadiantTemp = weather.solarRadiation > 0
    ? temp + 0.08 * weather.solarRadiation - 1.2 * Math.sqrt(windMs)
    : temp;
  const utci = temp + 0.2 * (meanRadiantTemp - temp) - 0.1 * windMs + 0.05 * humidity;
  const normalized = [
    Math.min(100, Math.max(0, (heatIndex - 25) * 3)),
    Math.min(100, Math.max(0, (wbgt - 20) * 4)),
    Math.min(100, Math.max(0, (utci - 20) * 2.5)),
  ];
  const score = Math.max(
    normalized[2] * 0.45 + normalized[1] * 0.35 + normalized[0] * 0.2,
    0.85 * Math.max(...normalized),
  );

  return {
    heatIndex: Number(heatIndex.toFixed(1)),
    wbgt: Number(wbgt.toFixed(1)),
    utci: Number(utci.toFixed(1)),
    htss: Number(score.toFixed(1)),
  };
};

const getThermalContributions = (thermal: ThermalStressData): { factor: string; contribution: number }[] => {
  const weighted = [
    { factor: 'UTCI', value: Math.min(100, Math.max(0, (thermal.utci - 20) * 2.5)) * 0.45 },
    { factor: 'WBGT', value: Math.min(100, Math.max(0, (thermal.wbgt - 20) * 4)) * 0.35 },
    { factor: 'Heat Index', value: Math.min(100, Math.max(0, (thermal.heatIndex - 25) * 3)) * 0.2 },
  ];
  const total = weighted.reduce((sum, item) => sum + item.value, 0);
  return weighted.map(({ factor, value }) => ({
    factor,
    contribution: total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0,
  }));
};

const riskLevelForScore = (score: number): string => {
  if (score > 80) return 'Extreme';
  if (score > 65) return 'High';
  if (score > 45) return 'Moderate';
  if (score > 25) return 'Low';
  return 'Safe';
};

const getHourlyWeather = async (lat: number, lon: number, pastDay = false) => {
  const response = await axios.get<{
    current: { time: string };
    hourly: {
      time: string[];
      temperature_2m: number[];
      relative_humidity_2m: number[];
      wind_speed_10m: number[];
      direct_radiation: number[];
    };
  }>('https://api.open-meteo.com/v1/forecast', {
    params: {
      latitude: lat,
      longitude: lon,
      current: 'temperature_2m',
      hourly: 'temperature_2m,relative_humidity_2m,wind_speed_10m,direct_radiation',
      timezone: 'auto',
      ...(pastDay ? { past_days: 1 } : { forecast_hours: 24 }),
    },
  });
  return response.data;
};

const weatherAtHour = (
  hourly: Awaited<ReturnType<typeof getHourlyWeather>>['hourly'],
  index: number,
): WeatherData => ({
  temperature: hourly.temperature_2m[index],
  humidity: hourly.relative_humidity_2m[index],
  windSpeed: hourly.wind_speed_10m[index],
  solarRadiation: hourly.direct_radiation[index],
  timestamp: hourly.time[index],
});

const formatHourlyTime = (timestamp: string): string => timestamp.split('T')[1]?.slice(0, 5) ?? timestamp;

const withDemoFallback = async <T>(apiCall: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    const res = await apiCall();
    return res;
  } catch (err) {
    console.warn('API call failed, using demo data', err);
    return fallback;
  }
};

export const apiService = {
  getWeather: async (lat: number, lon: number): Promise<WeatherData> => {
    try {
      const response = await api.get<ApiWeather>('/weather', { params: { lat, lon } });
      return toWeatherData(response.data);
    } catch (error) {
      console.warn('Backend weather request failed; fetching current weather directly.', error);
      return getOpenMeteoWeather(lat, lon);
    }
  },
  getThermalStress: async (lat: number, lon: number): Promise<ThermalStressData> => {
    try {
      const response = await api.get<ApiThermalStress>('/thermal-stress', { params: { lat, lon } });
      return toThermalStressData(response.data);
    } catch (error) {
      console.warn('Backend thermal-stress request failed; calculating from current location weather.', error);
      return calculateThermalStress(await getOpenMeteoWeather(lat, lon));
    }
  },
  getRisk: async (lat: number, lon: number): Promise<RiskAssessment> => {
    try {
      const { data } = await api.get<{
        risk_level: string;
        risk_score: number;
        thermal_stress: ApiThermalStress;
        recommendations: { target: string; priority: string; action: string }[];
      }>('/risk', { params: { lat, lon } });
      return {
        level: data.risk_level,
        score: data.risk_score,
        probability: data.risk_score,
        primaryFactors: Object.entries(data.thermal_stress.contributions).map(([factor, contribution]) => ({ factor, contribution })),
        recommendations: data.recommendations.map((recommendation) => ({
          audience: recommendation.target,
          text: recommendation.action,
          icon: 'Info',
          urgency: recommendation.priority.toLowerCase() === 'critical' ? 'extreme' : recommendation.priority.toLowerCase(),
        })),
      };
    } catch (error) {
      console.warn('Backend risk request failed; deriving risk from current location weather.', error);
      const weather = await getOpenMeteoWeather(lat, lon);
      const thermal = calculateThermalStress(weather);
      const level = riskLevelForScore(thermal.htss);
      const recommendations = level === 'Extreme'
        ? [
            { audience: 'Citizens', text: 'Avoid outdoor activity during the hottest part of the day.', icon: 'Home', urgency: 'extreme' },
            { audience: 'Outdoor workers', text: 'Stop strenuous outdoor work and seek a cool area.', icon: 'Briefcase', urgency: 'extreme' },
          ]
        : level === 'High' || level === 'Moderate'
          ? [{ audience: 'Everyone', text: 'Stay hydrated and limit strenuous outdoor activity.', icon: 'Droplets', urgency: 'high' }]
          : [{ audience: 'Everyone', text: 'Stay hydrated and take breaks in the shade.', icon: 'Info', urgency: 'low' }];
      return {
        level,
        score: thermal.htss,
        probability: Math.min(100, Math.max(0, (weather.temperature - 37) * 8 + (weather.humidity - 40) * 0.25)),
        primaryFactors: getThermalContributions(thermal),
        recommendations,
      };
    }
  },
  getForecast: async (lat: number, lon: number, hours: number = 24): Promise<ForecastData> => {
    try {
      const { data } = await api.get<{
        forecasts: { time: string; temp: number; humidity: number; wind: number; solar: number; htss_score: number; risk_level: string }[];
      }>('/forecast', { params: { lat, lon, hours } });
      return { timeline: data.forecasts.map((point) => ({
        time: new Date(point.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        temperature: point.temp,
        htss: point.htss_score,
        riskLevel: point.risk_level,
      })) };
    } catch (error) {
      console.warn('Backend forecast request failed; fetching hourly forecast directly.', error);
      const { hourly } = await getHourlyWeather(lat, lon);
      const count = Math.min(hours, hourly.time.length);
      return {
        timeline: Array.from({ length: count }, (_, index) => {
          const weather = weatherAtHour(hourly, index);
          const thermal = calculateThermalStress(weather);
          return {
            time: formatHourlyTime(weather.timestamp),
            temperature: weather.temperature,
            htss: thermal.htss,
            riskLevel: riskLevelForScore(thermal.htss),
          };
        }),
      };
    }
  },
  getVulnerability: (state: string): Promise<VulnerabilityData> => withDemoFallback(
    () => api.get<{
      state: string; density: number; elderly_pct: number; outdoor_workers_pct: number;
      poverty_pct: number; healthcare_access: number;
    }>('/vulnerability', { params: { state } }).then(({ data }) => ({
      state: data.state,
      populationDensity: data.density,
      elderlyPercentage: data.elderly_pct,
      outdoorWorkersPercentage: data.outdoor_workers_pct,
      povertyPercentage: data.poverty_pct,
      healthcareAccess: data.healthcare_access,
    })),
    demoData.demoVulnerability,
  ),
  getAlerts: async (lat: number, lon: number): Promise<Alert[]> => {
    try {
      const { data } = await api.get<ApiAlert[]>('/alerts', { params: { lat, lon } });
      return data.map(toAlert);
    } catch (error) {
      console.warn('Backend alerts request failed; deriving alert from current location weather.', error);
      const thermal = calculateThermalStress(await getOpenMeteoWeather(lat, lon));
      if (thermal.htss <= 60) return [];
      const extreme = thermal.htss > 85;
      return [{
        id: `local-${lat}-${lon}`,
        title: extreme ? 'Extreme Heat Danger' : 'Heat Stress Alert',
        message: extreme
          ? 'Very high thermal stress. Avoid outdoor activity and seek a cool place.'
          : 'Elevated thermal stress. Stay hydrated and limit strenuous outdoor activity.',
        severity: extreme ? 'red' : 'orange',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actions: extreme ? ['Stay indoors', 'Drink water', 'Check on vulnerable people'] : ['Stay hydrated', 'Take breaks in shade'],
      }];
    }
  },
  getDemoScenarios: (): Promise<DemoScenario[]> => withDemoFallback(
    () => api.get<Omit<DemoScenario, 'icon'>[]>('/demo/scenarios').then(({ data }) => data.map((scenario) => ({
      ...scenario,
      icon: scenario.id === 'normal' ? 'Sun' : 'Flame',
    }))),
    demoData.demoScenarios,
  ),
  activateScenario: (id: string) => (
    id === 'reset'
      ? api.post('/demo/reset')
      : api.post('/demo/activate', { scenario_id: id })
  ).then(r => r.data),
  getGovernmentDashboard: (): Promise<GovernmentDashboard> => withDemoFallback(
    () => api.get<{
      total_states_affected: number;
      high_risk_locations: number;
      active_alerts: number;
      affected_population: number;
      cities: {
        name: string; state: string; lat: number; lon: number; temperature: number; humidity: number;
        wind_speed: number; solar_radiation: number; heat_index: number; wbgt: number; utci: number;
        htss_score: number; risk_level: string; heatwave_probability: number;
      }[];
    }>('/dashboard/government').then(({ data }) => ({
      statesAffected: data.total_states_affected,
      highRiskLocations: data.high_risk_locations,
      activeAlerts: data.active_alerts,
      affectedPopulation: data.affected_population,
      cities: data.cities.map((city) => ({
        id: city.name,
        name: city.name,
        state: city.state,
        lat: city.lat,
        lon: city.lon,
        weather: {
          temperature: city.temperature,
          humidity: city.humidity,
          windSpeed: city.wind_speed,
          solarRadiation: city.solar_radiation,
          timestamp: new Date().toISOString(),
        },
        thermal: { heatIndex: city.heat_index, wbgt: city.wbgt, utci: city.utci, htss: city.htss_score },
        risk: {
          level: city.risk_level,
          score: city.htss_score,
          probability: city.heatwave_probability,
          primaryFactors: [],
          recommendations: [],
        },
        alerts: [],
      })),
    })),
    demoData.demoGovernmentDashboard,
  ),
  getHistorical: async (lat: number, lon: number): Promise<HistoricalData> => {
    const { current, hourly } = await getHourlyWeather(lat, lon, true);
    const currentHour = `${current.time.slice(0, 13)}:00`;
    const currentIndex = hourly.time.indexOf(currentHour);
    const endIndex = currentIndex >= 0 ? currentIndex : hourly.time.length - 1;
    const startIndex = Math.max(0, endIndex - 23);
    const indexes = Array.from({ length: endIndex - startIndex + 1 }, (_, index) => startIndex + index);
    return {
      labels: indexes.map((index) => formatHourlyTime(hourly.time[index])),
      htss: indexes.map((index) => calculateThermalStress(weatherAtHour(hourly, index)).htss),
      temperature: indexes.map((index) => hourly.temperature_2m[index]),
    };
  },
  getMLPrediction: (lat: number, lon: number) => withDemoFallback(() => api.get<MLPrediction>('/risk/predict', { params: { lat, lon } }).then(r => r.data), demoData.demoMLPrediction),
};
