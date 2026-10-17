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
  getWeather: (lat: number, lon: number): Promise<WeatherData> => withDemoFallback(
    () => api.get<ApiWeather>('/weather', { params: { lat, lon } }).then(r => toWeatherData(r.data)),
    demoData.demoWeather,
  ),
  getThermalStress: (lat: number, lon: number): Promise<ThermalStressData> => withDemoFallback(
    () => api.get<ApiThermalStress>('/thermal-stress', { params: { lat, lon } }).then(r => toThermalStressData(r.data)),
    demoData.demoThermal,
  ),
  getRisk: (lat: number, lon: number): Promise<RiskAssessment> => withDemoFallback(
    () => api.get<{
      risk_level: string;
      risk_score: number;
      alerts: ApiAlert[];
      recommendations: { target: string; priority: string; action: string }[];
      thermal_stress: ApiThermalStress;
    }>('/risk', { params: { lat, lon } }).then(({ data }) => ({
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
    })),
    demoData.demoRisk,
  ),
  getForecast: (lat: number, lon: number, hours: number = 24): Promise<ForecastData> => withDemoFallback(
    () => api.get<{ forecasts: { time: string; temp: number; htss_score: number; risk_level: string }[] }>('/forecast', { params: { lat, lon, hours } })
      .then(({ data }) => ({ timeline: data.forecasts.map((point) => ({
        time: new Date(point.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        temperature: point.temp,
        htss: point.htss_score,
        riskLevel: point.risk_level,
      })) })),
    demoData.demoForecast,
  ),
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
  getAlerts: (lat: number, lon: number): Promise<Alert[]> => withDemoFallback(
    () => api.get<ApiAlert[]>('/alerts', { params: { lat, lon } }).then(({ data }) => data.map(toAlert)),
    demoData.demoAlerts,
  ),
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
  getHistorical: (location: string): Promise<HistoricalData> => withDemoFallback(
    () => api.get<{ location: string; years: { year: number; avg_temp: number; heatwave_days: number }[] }[]>('/dashboard/historical', { params: { location } })
      .then(({ data }) => ({
        labels: data[0]?.years.map(({ year }) => String(year)) ?? [],
        htss: data[0]?.years.map(({ heatwave_days }) => heatwave_days) ?? [],
        temperature: data[0]?.years.map(({ avg_temp }) => avg_temp) ?? [],
      })),
    demoData.demoHistorical,
  ),
  getMLPrediction: (lat: number, lon: number) => withDemoFallback(() => api.get<MLPrediction>('/risk/predict', { params: { lat, lon } }).then(r => r.data), demoData.demoMLPrediction),
};
