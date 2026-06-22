// services/weatherService.ts
//@ts-nocheck
import axios from "axios";
import { prisma } from "../config/connectDb.js";
import type { WeatherForecastResponse } from "../types/index.js";

const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";

const weatherCodeMap: Record<number, string> = {
  0: "Clear Sky",
  1: "Mainly Clear",
  2: "Partly Cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing Rime Fog",
  51: "Light Drizzle",
  53: "Moderate Drizzle",
  55: "Dense Drizzle",
  61: "Slight Rain",
  63: "Moderate Rain",
  65: "Heavy Rain",
  71: "Slight Snow Fall",
  73: "Moderate Snow Fall",
  75: "Heavy Snow Fall",
  80: "Slight Rain Showers",
  81: "Moderate Rain Showers",
  82: "Violent Rain Showers",
  // Add more as needed
};

export const weatherService = {
  async getForecast(
    userId: string,
    lat?: number,
    lon?: number,
  ): Promise<WeatherForecastResponse> {
    try {
      let latitude = lat;
      let longitude = lon;

      //  Get user profile with preferredCrops and location
      const profile = await prisma.profile.findUnique({
        where: { userId },
        select: {
          location: true,
          preferredCrops: true,
        },
      });

      if (!latitude || !longitude) {
        if (!profile?.location?.latitude || !profile?.location?.longitude) {
          return {
            success: false,
            message:
              "No location found. Please update your farm location in your profile.",
            errorType: "LOCATION_MISSING",
          };
        }

        latitude = profile.location.latitude as number;
        longitude = profile.location.longitude as number;
      }

      const params = new URLSearchParams({
        latitude: latitude.toString(),
        longitude: longitude.toString(),
        current:
          "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code",
        daily:
          "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,relative_humidity_2m_max,weather_code",
        forecast_days: "7",
        timezone: "auto",
      });

      const response = await axios.get(
        `${OPEN_METEO_BASE}?${params.toString()}`,
      );
      const rawData = response.data;

      //  Use preferredCrops from profile
      const userCrops = profile?.preferredCrops || [];

      const riskInsights = generateDiseaseRiskInsights(rawData, userCrops);
      const overallSummary = generateOverallSummary(rawData, riskInsights);

      // Log request
      await prisma.weatherRequest.create({
        data: {
          userId,
          latitude,
          longitude,
          rawData,
          riskSummary: { riskInsights, overallSummary },
        },
      });

      return {
        success: true,
        data: {
          location: { latitude, longitude },
          current: {
            ...rawData.current,
            weatherDescription:
              weatherCodeMap[rawData.current?.weather_code] || "Unknown",
          },
          daily: {
            ...rawData.daily,
            weatherDescriptions: rawData.daily.weather_code.map(
              (code: number) => weatherCodeMap[code] || "Unknown",
            ),
          },
          riskInsights,
          overallSummary, // NEW ADDITION: Friendly summary
        },
      };
    } catch (error: any) {
      console.error("Weather service error:", error.message);
      return {
        success: false,
        message:
          "Unable to fetch weather data at the moment. Please try again later.",
        errorType: "WEATHER_FETCH_FAILED",
      };
    }
  },
};

//  Rule-based risk engine (easy to extend)
function generateDiseaseRiskInsights(weatherData: any, userCrops: string[]) {
  const insights: any[] = [];
  const daily = weatherData.daily;
  const humidity = weatherData.current?.relative_humidity_2m || 0;
  const precipProb = Math.max(...(daily.precipitation_probability_max || [0]));

  userCrops.forEach((crop) => {
    let riskLevel: "Low" | "Medium" | "High" = "Low";
    const factors: string[] = [];

    if (humidity > 75) factors.push("High humidity");
    if (precipProb > 60) factors.push("High rain probability");

    if (humidity > 80 && precipProb > 50) {
      riskLevel = "High";
    } else if (humidity > 70 || precipProb > 40) {
      riskLevel = "Medium";
    }

    let message = `${crop} conditions look manageable.`;
    if (crop === "MAIZE") {
      message =
        riskLevel === "High"
          ? "High risk of fungal diseases (e.g. leaf blight). Consider preventive spray."
          : "Favourable conditions for maize.";
    } else if (crop === "CASSAVA") {
      message =
        riskLevel === "High"
          ? "Watch for bacterial blight due to wet conditions."
          : "Good conditions for cassava.";
    } else if (crop === "COCOA") {
      message =
        riskLevel === "High"
          ? "High risk of Black Pod disease. Ensure good drainage."
          : "Monitor cocoa pods for fungal signs.";
    }

    insights.push({
      crop,
      riskLevel,
      message,
      factors,
    });
  });

  return insights;
}

function generateOverallSummary(weatherData: any, riskInsights: any[]) {
  const highRiskCrops = riskInsights.filter((r) => r.riskLevel === "High");
  const precipProb = Math.max(
    ...(weatherData.daily.precipitation_probability_max || [0]),
  );
  const avgTemp =
    weatherData.daily.temperature_2m_max.reduce(
      (a: number, b: number) => a + b,
      0,
    ) / 7;

  let summary = `Current temperature is around ${Math.round(weatherData.current.temperature_2m)}°C with ${weatherData.current.relative_humidity_2m}% humidity. `;

  if (precipProb > 70) {
    summary += "The coming days will be quite wet. ";
  } else if (precipProb > 40) {
    summary += "Some rain is expected in the next few days. ";
  } else {
    summary += "Mostly dry weather ahead. ";
  }

  if (highRiskCrops.length > 0) {
    summary += `High disease risk for ${highRiskCrops.map((c) => c.crop).join(", ")}. Take preventive actions.`;
  } else {
    summary += "Overall good conditions for farming.";
  }

  return summary;
}
