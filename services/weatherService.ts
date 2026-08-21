// services/weatherService.ts
//@ts-nocheck
import axios from "axios";
import { prisma } from "../config/connectDb.js";
import type { WeatherForecastResponse } from "../types/index.js";
import { subscriptionService } from "./subscriptionService.js";

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

type RiskLevel = "Low" | "Medium" | "High";

type CropRiskProfile = {
  primaryDiseases: string;
  // High requires stronger evidence (fewer false positives)
  high: {
    maxHumidity3d: number; // max of daily relative_humidity_2m_max over next 3 days
    wetDays3d: number; // days with precip_probability_max >= 50 in next 3 days
    precipProbMax3d: number;
    // optional temp band (avg of daily max temps) that favours the disease
    tempMinC?: number;
    tempMaxC?: number;
  };
  medium: {
    maxHumidity3d: number;
    wetDays3d: number;
    precipProbMax3d: number;
  };
  messages: {
    en: { High: string; Medium: string; Low: string };
    tw: { High: string; Medium: string; Low: string };
  };
};

// Full profiles for all 10 supported crops
const CROP_RISK_PROFILES: Record<string, CropRiskProfile> = {
  MAIZE: {
    primaryDiseases: "Northern Leaf Blight / Gray Leaf Spot / Common Rust",
    high: {
      maxHumidity3d: 85,
      wetDays3d: 2,
      precipProbMax3d: 70,
      tempMinC: 20,
      tempMaxC: 32,
    },
    medium: {
      maxHumidity3d: 75,
      wetDays3d: 1,
      precipProbMax3d: 50,
    },
    messages: {
      en: {
        High: "High risk of fungal leaf diseases (Northern Leaf Blight, Gray Leaf Spot). Improve air flow, remove lower infected leaves, and consider preventive organic spray (e.g. neem) if symptoms appear.",
        Medium:
          "Moderate fungal pressure expected for maize. Watch for elongated lesions on leaves and keep the field free of excess moisture.",
        Low: "Favourable conditions for maize. Continue regular field scouting.",
      },
      tw: {
        High: "Nneɛma a ɛyɛ den wɔ fungal yareɛ (Northern Leaf Blight, Gray Leaf Spot) so. Ma mframa nkɔ so, yi nhaban a ayare no, na sɛ wohu sɛnkyerɛnne a, fa neem anaa organic ayaresa di dwuma.",
        Medium:
          "Fungal yareɛ tumi wɔ maize so. Hwɛ nhaban so na ma asase no nnya nsu pii.",
        Low: "Nneɛma yɛ papa ma maize. Toa so hwɛ afuw no.",
      },
    },
  },
  CASSAVA: {
    primaryDiseases: "Bacterial Blight / Root Rot",
    high: {
      maxHumidity3d: 88,
      wetDays3d: 3,
      precipProbMax3d: 75,
    },
    medium: {
      maxHumidity3d: 78,
      wetDays3d: 2,
      precipProbMax3d: 55,
    },
    messages: {
      en: {
        High: "High risk of bacterial blight and root rot from prolonged wetness. Improve drainage immediately and avoid walking in the field when leaves are wet.",
        Medium:
          "Wet conditions favour cassava bacterial blight and root problems. Check drainage channels and remove any rotting plants.",
        Low: "Good conditions for cassava. Keep monitoring for leaf spots.",
      },
      tw: {
        High: "Bacterial blight ne root rot yareɛ tumi wɔ cassava so esiane nsu a ɛtra no. Ma nsu nkɔ so ntɛm na mma nantew wɔ afuw no mu sɛ nhaban yɛ fɔɔfoɔ.",
        Medium:
          "Nsu pii boa cassava bacterial blight. Hwɛ drainage na yi nnua a ɛreporɔw.",
        Low: "Nneɛma yɛ papa ma cassava. Toa so hwɛ nhaban so.",
      },
    },
  },
  COCOA: {
    primaryDiseases: "Black Pod (Phytophthora)",
    high: {
      maxHumidity3d: 88,
      wetDays3d: 2,
      precipProbMax3d: 65,
      tempMinC: 20,
      tempMaxC: 30,
    },
    medium: {
      maxHumidity3d: 80,
      wetDays3d: 1,
      precipProbMax3d: 50,
    },
    messages: {
      en: {
        High: "High Black Pod risk. Prune for better air flow, remove infected pods immediately, reduce shade if dense, and ensure good drainage. Inspect pods daily.",
        Medium:
          "Conditions favour Black Pod. Remove diseased pods, keep weeds low, and improve ventilation under the canopy.",
        Low: "Lower Black Pod pressure. Continue regular pod inspection and farm sanitation.",
      },
      tw: {
        High: "Black Pod yareɛ tumi kɛse. Twa nnua no ma mframa nkɔ so, yi pods a ayare no ntɛm, te shade so sɛ ɛyɛ den, na ma nsu nkɔ so. Hwɛ pods da biara.",
        Medium:
          "Nneɛma boa Black Pod. Yi pods a ayare, te wura so, na ma mframa nkɔ so wɔ nnua no ase.",
        Low: "Black Pod tumi sua. Toa so hwɛ pods na yɛ farm sanitation.",
      },
    },
  },
  TOMATO: {
    primaryDiseases: "Early Blight / Late Blight",
    high: {
      maxHumidity3d: 85,
      wetDays3d: 2,
      precipProbMax3d: 65,
      tempMinC: 15,
      tempMaxC: 28,
    },
    medium: {
      maxHumidity3d: 75,
      wetDays3d: 1,
      precipProbMax3d: 45,
    },
    messages: {
      en: {
        High: "High risk of Early/Late Blight. Avoid overhead watering, stake plants for air flow, remove lower infected leaves, and consider copper-based or approved organic spray early.",
        Medium:
          "Blight-favourable weather ahead. Improve spacing/air flow and scout daily for dark spots with yellow margins.",
        Low: "Favourable conditions for tomato. Maintain good hygiene and staking.",
      },
      tw: {
        High: "Early/Late Blight yareɛ tumi. Mma nsu nto nhaban so, ma nnua no nnyina sɛnea mframa bɛkɔ so, yi nhaban a ayare, na fa copper anaa organic ayaresa di dwuma ntɛm.",
        Medium:
          "Blight yareɛ betumi aba. Ma mframa nkɔ so na hwɛ da biara sɛ wohu ntam a ɛyɛ tuntum a kɔkɔɔ wɔ ho.",
        Low: "Nneɛma yɛ papa ma tomato. Kɔ so yɛ hygiene ne staking.",
      },
    },
  },
  PEPPER: {
    primaryDiseases: "Bacterial Spot / Anthracnose",
    high: {
      maxHumidity3d: 85,
      wetDays3d: 2,
      precipProbMax3d: 70,
    },
    medium: {
      maxHumidity3d: 75,
      wetDays3d: 1,
      precipProbMax3d: 50,
    },
    messages: {
      en: {
        High: "High risk of bacterial spot and anthracnose. Avoid working plants when wet, improve air circulation, and remove infected fruits/leaves promptly.",
        Medium:
          "Humidity and rain favour pepper leaf and fruit diseases. Scout for dark lesions and keep the field clean.",
        Low: "Good conditions for pepper. Continue regular scouting.",
      },
      tw: {
        High: "Bacterial spot ne anthracnose yareɛ tumi. Mma nyɛ adwuma wɔ nnua no so sɛ ɛyɛ fɔɔfoɔ, ma mframa nkɔ so, na yi aba ne nhaban a ayare ntɛm.",
        Medium:
          "Humidity ne nsu boa pepper yareɛ. Hwɛ sɛ wohu ntam tuntum na ma afuw no nni fi.",
        Low: "Nneɛma yɛ papa ma pepper. Toa so hwɛ afuw no.",
      },
    },
  },
  PLANTAIN: {
    primaryDiseases: "Black Sigatoka",
    high: {
      maxHumidity3d: 85,
      wetDays3d: 2,
      precipProbMax3d: 65,
    },
    medium: {
      maxHumidity3d: 75,
      wetDays3d: 1,
      precipProbMax3d: 50,
    },
    messages: {
      en: {
        High: "High Black Sigatoka pressure. Remove severely affected leaves, improve spacing/air flow, and avoid leaving infected debris in the field.",
        Medium:
          "Conditions favour Black Sigatoka. Deleaf heavily spotted leaves and maintain good drainage.",
        Low: "Lower Sigatoka pressure. Keep up regular deleafing and field sanitation.",
      },
      tw: {
        High: "Black Sigatoka yareɛ tumi. Yi nhaban a ayare kɛse, ma mframa nkɔ so, na mma nnya nhaban a ayare wɔ afuw no mu.",
        Medium:
          "Nneɛma boa Black Sigatoka. Yi nhaban a ɛwɔ ntam pii na ma nsu nkɔ so.",
        Low: "Sigatoka tumi sua. Toa so yi nhaban na yɛ sanitation.",
      },
    },
  },
  RICE: {
    primaryDiseases: "Rice Blast / Bacterial Leaf Blight",
    high: {
      maxHumidity3d: 88,
      wetDays3d: 2,
      precipProbMax3d: 70,
      tempMinC: 20,
      tempMaxC: 30,
    },
    medium: {
      maxHumidity3d: 80,
      wetDays3d: 1,
      precipProbMax3d: 55,
    },
    messages: {
      en: {
        High: "High risk of rice blast and bacterial leaf blight. Avoid excess nitrogen, ensure good water management, and scout for diamond-shaped lesions or leaf-tip drying.",
        Medium:
          "Humid wet weather favours blast and blight. Monitor leaves closely and avoid prolonged leaf wetness where possible.",
        Low: "Favourable conditions for rice. Maintain balanced fertiliser and regular scouting.",
      },
      tw: {
        High: "Rice blast ne bacterial leaf blight yareɛ tumi. Mma nfa nitrogen pii, ma nsu nni so yie, na hwɛ sɛ wohu ntam a ɛte sɛ diamond anaa nhaban a ɛrewow.",
        Medium:
          "Humidity ne nsu boa blast ne blight. Hwɛ nhaban yie na sɛ ɛbɛyɛ a, ma nhaban no nnya fɔɔfoɔ ntra.",
        Low: "Nneɛma yɛ papa ma rice. Fa fertiliser a ɛyɛ balance na toa so hwɛ.",
      },
    },
  },
  YAM: {
    primaryDiseases: "Anthracnose / Tuber Rot",
    high: {
      maxHumidity3d: 88,
      wetDays3d: 3,
      precipProbMax3d: 75,
    },
    medium: {
      maxHumidity3d: 78,
      wetDays3d: 2,
      precipProbMax3d: 55,
    },
    messages: {
      en: {
        High: "High risk of anthracnose and tuber rot from excess moisture. Improve drainage, avoid wounding tubers, and remove diseased vines early.",
        Medium:
          "Wet conditions increase yam anthracnose and rot risk. Check mounds for waterlogging and keep the field clean.",
        Low: "Good conditions for yam. Continue routine field checks.",
      },
      tw: {
        High: "Anthracnose ne tuber rot yareɛ tumi esiane nsu pii. Ma nsu nkɔ so, mma mma yam no nnya pira, na yi nnua a ayare ntɛm.",
        Medium:
          "Nsu pii ma yam anthracnose ne rot yareɛ. Hwɛ sɛ nsu ntra mounds so na ma afuw no nni fi.",
        Low: "Nneɛma yɛ papa ma yam. Toa so hwɛ afuw no.",
      },
    },
  },
  GROUNDNUT: {
    primaryDiseases: "Leaf Spot / Rosette pressure patterns",
    high: {
      maxHumidity3d: 85,
      wetDays3d: 2,
      precipProbMax3d: 65,
    },
    medium: {
      maxHumidity3d: 75,
      wetDays3d: 1,
      precipProbMax3d: 50,
    },
    messages: {
      en: {
        High: "High leaf-spot pressure. Ensure good spacing, avoid late weeding that spreads spores, and consider early protective measures if spots appear.",
        Medium:
          "Humidity favours groundnut leaf diseases. Scout lower leaves and maintain clean fields.",
        Low: "Favourable conditions for groundnut. Keep up regular scouting.",
      },
      tw: {
        High: "Leaf-spot yareɛ tumi. Ma nnua no nnya kwan, mma ntu wura akyɛ a ɛbɛspread spores, na sɛ wohu ntam a, fa ayaresa di dwuma ntɛm.",
        Medium:
          "Humidity boa groundnut leaf yareɛ. Hwɛ nhaban a ɛwɔ ase na ma afuw no nni fi.",
        Low: "Nneɛma yɛ papa ma groundnut. Toa so hwɛ afuw no.",
      },
    },
  },
  ONION: {
    primaryDiseases: "Downy Mildew / Purple Blotch",
    high: {
      maxHumidity3d: 85,
      wetDays3d: 2,
      precipProbMax3d: 65,
      tempMinC: 15,
      tempMaxC: 28,
    },
    medium: {
      maxHumidity3d: 75,
      wetDays3d: 1,
      precipProbMax3d: 50,
    },
    messages: {
      en: {
        High: "High risk of downy mildew and purple blotch. Improve air flow, avoid overhead irrigation, and remove infected leaves early.",
        Medium:
          "Humid conditions favour onion foliar diseases. Scout for purple lesions and keep the bed well drained.",
        Low: "Good conditions for onion. Maintain good spacing and hygiene.",
      },
      tw: {
        High: "Downy mildew ne purple blotch yareɛ tumi. Ma mframa nkɔ so, mma nsu nto nhaban so, na yi nhaban a ayare ntɛm.",
        Medium:
          "Humidity boa onion leaf yareɛ. Hwɛ sɛ wohu ntam a ɛyɛ purple na ma asase no nnya nsu pii.",
        Low: "Nneɛma yɛ papa ma onion. Ma nnua no nnya kwan na yɛ hygiene.",
      },
    },
  },
};

// Derive multi-day weather features from Open-Meteo daily arrays.
// Uses a 3-day action window (weighted) plus 7-day context.
function extractWeatherFeatures(weatherData: any) {
  const daily = weatherData.daily || {};
  const humidityMaxArr: number[] = daily.relative_humidity_2m_max || [];
  const precipProbArr: number[] = daily.precipitation_probability_max || [];
  const precipSumArr: number[] = daily.precipitation_sum || [];
  const tempMaxArr: number[] = daily.temperature_2m_max || [];

  const take = (arr: number[], n: number) =>
    arr.slice(0, Math.min(n, arr.length));

  const hum3 = take(humidityMaxArr, 3);
  const prob3 = take(precipProbArr, 3);
  const temp3 = take(tempMaxArr, 3);

  const maxHumidity3d = hum3.length
    ? Math.max(...hum3)
    : weatherData.current?.relative_humidity_2m || 0;
  const precipProbMax3d = prob3.length ? Math.max(...prob3) : 0;
  const wetDays3d = prob3.filter((p) => p >= 50).length;
  const avgTempMax3d = temp3.length
    ? temp3.reduce((a, b) => a + b, 0) / temp3.length
    : 25;

  // 7-day context (used lightly for sustained risk messaging / factors)
  const maxHumidity7d = humidityMaxArr.length
    ? Math.max(...humidityMaxArr)
    : maxHumidity3d;
  const precipProbMax7d = precipProbArr.length
    ? Math.max(...precipProbArr)
    : precipProbMax3d;
  const totalPrecip7d = precipSumArr.length
    ? precipSumArr.reduce((a, b) => a + b, 0)
    : 0;

  return {
    maxHumidity3d,
    precipProbMax3d,
    wetDays3d,
    avgTempMax3d,
    maxHumidity7d,
    precipProbMax7d,
    totalPrecip7d,
    currentHumidity: weatherData.current?.relative_humidity_2m || 0,
  };
}

async function fetchOpenMeteo(url: string, retries = 3) {
  let lastError: any;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await axios.get(url, {
        timeout: 12000,
        headers: {
          "User-Agent": "CropDiseaseApp/1.0 (Ghana farmer weather)",
          Accept: "application/json",
        },
      });
    } catch (err: any) {
      lastError = err;
      console.error(`Open-Meteo attempt ${attempt}/${retries}:`, err.message);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 800 * attempt)); // simple backoff
      }
    }
  }
  throw lastError;
}

// Score a single crop against its profile using the blended features.
function scoreCropRisk(
  crop: string,
  features: ReturnType<typeof extractWeatherFeatures>,
  language: "en" | "tw",
): { riskLevel: RiskLevel; message: string; factors: string[] } {
  const profile = CROP_RISK_PROFILES[crop];
  const lang = language === "tw" ? "tw" : "en";

  // Fallback for unknown / FREE / unexpected values
  if (!profile) {
    return {
      riskLevel: "Low",
      message:
        lang === "tw"
          ? `${crop} nneɛma yɛ papa. Toa so hwɛ afuw no.`
          : `${crop} conditions look manageable. Continue regular field checks.`,
      factors: [],
    };
  }

  const factors: string[] = [];
  const {
    maxHumidity3d,
    precipProbMax3d,
    wetDays3d,
    avgTempMax3d,
    maxHumidity7d,
    precipProbMax7d,
  } = features;

  if (maxHumidity3d >= 80)
    factors.push(lang === "tw" ? "Humidity a ɛkorɔn" : "High humidity");
  if (precipProbMax3d >= 60)
    factors.push(
      lang === "tw" ? "Nsu a ɛbɛtɔ a ɛkorɔn" : "High rain probability",
    );
  if (wetDays3d >= 2)
    factors.push(
      lang === "tw" ? "Nna a nsu bɛtɔ pii" : "Multiple wet days ahead",
    );
  if (maxHumidity7d >= 85 && precipProbMax7d >= 60)
    factors.push(
      lang === "tw"
        ? "Nsu ne humidity a ɛkɔ so"
        : "Sustained wet/humid outlook",
    );

  // Temperature band check (only when profile defines it)
  let tempInBand = true;
  if (profile.high.tempMinC != null && profile.high.tempMaxC != null) {
    tempInBand =
      avgTempMax3d >= profile.high.tempMinC &&
      avgTempMax3d <= profile.high.tempMaxC;
  }

  // High: requires multi-factor evidence (conservative)
  const meetsHigh =
    maxHumidity3d >= profile.high.maxHumidity3d &&
    wetDays3d >= profile.high.wetDays3d &&
    precipProbMax3d >= profile.high.precipProbMax3d &&
    tempInBand;

  // Medium: lower bar, still needs at least two signals or a strong single signal
  const meetsMedium =
    (maxHumidity3d >= profile.medium.maxHumidity3d &&
      (wetDays3d >= profile.medium.wetDays3d ||
        precipProbMax3d >= profile.medium.precipProbMax3d)) ||
    precipProbMax3d >= profile.high.precipProbMax3d ||
    wetDays3d >= profile.high.wetDays3d;

  let riskLevel: RiskLevel = "Low";
  if (meetsHigh) riskLevel = "High";
  else if (meetsMedium) riskLevel = "Medium";

  const message = profile.messages[lang][riskLevel];

  return { riskLevel, message, factors };
}

//  Now accepts language and uses the new feature + profile engine
function generateDiseaseRiskInsights(
  weatherData: any,
  userCrops: string[],
  language: "en" | "tw" = "en",
) {
  const features = extractWeatherFeatures(weatherData);
  const insights: any[] = [];

  // Deduplicate while preserving order
  const uniqueCrops = [
    ...new Set(userCrops.map((c) => String(c).toUpperCase())),
  ];

  for (const crop of uniqueCrops) {
    // Skip FREE if it ever appears
    if (crop === "FREE") continue;

    const { riskLevel, message, factors } = scoreCropRisk(
      crop,
      features,
      language,
    );

    insights.push({
      crop,
      riskLevel,
      message,
      factors,
    });
  }

  return insights;
}

//  overall summary now language-aware and uses richer features
function generateOverallSummary(
  weatherData: any,
  riskInsights: any[],
  language: "en" | "tw" = "en",
) {
  const highRiskCrops = riskInsights.filter((r) => r.riskLevel === "High");
  const features = extractWeatherFeatures(weatherData);
  const temp = Math.round(weatherData.current?.temperature_2m ?? 0);
  const humidity = weatherData.current?.relative_humidity_2m ?? 0;

  if (language === "tw") {
    let summary = `Seesei temperature yɛ bɛyɛ ${temp}°C na humidity yɛ ${humidity}%. `;

    if (features.precipProbMax3d > 70) {
      summary += "Nna a ɛdi hɔ no bɛyɛ fɔɔfoɔ. ";
    } else if (features.precipProbMax3d > 40) {
      summary += "Nsu bi bɛtɔ wɔ nna kakra a ɛdi hɔ. ";
    } else {
      summary += "Nsu sua wɔ nna a ɛdi hɔ. ";
    }

    if (highRiskCrops.length > 0) {
      summary += `Yareɛ tumi kɛse wɔ ${highRiskCrops.map((c) => c.crop).join(", ")} so. Fa ayaresa di dwuma.`;
    } else {
      summary += "Nneɛma yɛ papa ma kuayɛ.";
    }
    return summary;
  }

  // English (default)
  let summary = `Current temperature is around ${temp}°C with ${humidity}% humidity. `;

  if (features.precipProbMax3d > 70) {
    summary += "The next few days will be quite wet. ";
  } else if (features.precipProbMax3d > 40) {
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

export const weatherService = {
  //  prefers UserPreferredCrop, falls back to profile.preferredCrops; passes language
  async getForecast(
    userId: string,
    lat?: number,
    lon?: number,
  ): Promise<WeatherForecastResponse> {
    try {
      let latitude = lat;
      let longitude = lon;

      //  also fetch language + UserPreferredCrop list
      const [profile, preferredCropsRows, user] = await Promise.all([
        prisma.profile.findUnique({
          where: { userId },
          select: {
            location: true,
            preferredCrops: true,
          },
        }),
        prisma.userPreferredCrop.findMany({
          where: { userId },
          select: { cropType: true },
        }),
        prisma.user.findUnique({
          where: { id: userId },
          select: { language: true },
        }),
      ]);

      if (!latitude || !longitude) {
        if (!profile?.location?.latitude || !profile?.location?.longitude) {
          return {
            success: false,
            message:
              "No location found. Please update your farm location in your profile.",
            errorType: "LOCATION_MISSING",
          };
          console.error(
            "Weather Error : No location found. Please update your farm location in your profile.",
          );
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

      const response = await fetchOpenMeteo(
        `${OPEN_METEO_BASE}?${params.toString()}`,
      );

      const rawData = response.data;

      //  Prefer richer UserPreferredCrop list; fall back to profile.preferredCrops
      const userCropsFromJunction = preferredCropsRows.map((r) => r.cropType);
      const userCrops =
        userCropsFromJunction.length > 0
          ? userCropsFromJunction
          : profile?.preferredCrops || [];

      const language = (user?.language === "tw" ? "tw" : "en") as "en" | "tw";

      //  pass language into generators
      const riskInsights = generateDiseaseRiskInsights(
        rawData,
        userCrops,
        language,
      );
      const overallSummary = generateOverallSummary(
        rawData,
        riskInsights,
        language,
      );

      await prisma.weatherRequest.create({
        data: {
          userId,
          latitude,
          longitude,
          rawData,
          riskSummary: { riskInsights, overallSummary },
        },
      });

      const hasInsights = await subscriptionService.canSeeCropInsights(userId);

      if (!hasInsights) {
        // weather-only summary without crop disease risk names
        const temp = Math.round(rawData.current?.temperature_2m ?? 0);
        const humidity = rawData.current?.relative_humidity_2m ?? 0;
        const weatherOnlySummary =
          language === "tw"
            ? `Seesei temperature yɛ bɛyɛ ${temp}°C na humidity yɛ ${humidity}%. Hwɛ wɔ weather forecast no so.`
            : `Current temperature is around ${temp}°C with ${humidity}% humidity. See the forecast for the next days.`;

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
            // riskInsights intentionally omitted for free users
            overallSummary: weatherOnlySummary,
          },
        };
      }

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
          overallSummary,
        },
      };
    } catch (error: any) {
      console.error("Weather service error:", {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        data: error.response?.data,
      });
      return {
        success: false,
        message:
          "Unable to fetch weather data at the moment. Please try again later.",
        errorType: "WEATHER_FETCH_FAILED",
      };
    }
  },

  async enrichForecast(
    userId: string,
    latitude: number,
    longitude: number,
    rawData: any,
  ): Promise<WeatherForecastResponse> {
    try {
      //  basic shape check so we do not process garbage payloads
      if (
        !rawData ||
        typeof latitude !== "number" ||
        typeof longitude !== "number" ||
        Number.isNaN(latitude) ||
        Number.isNaN(longitude)
      ) {
        return {
          success: false,
          message: "Invalid weather payload. Please try again.",
          errorType: "INVALID_PAYLOAD",
        };
      }

      //  load user crops + language (same sources as getForecast)
      const [profile, preferredCropsRows, user] = await Promise.all([
        prisma.profile.findUnique({
          where: { userId },
          select: {
            preferredCrops: true,
          },
        }),
        prisma.userPreferredCrop.findMany({
          where: { userId },
          select: { cropType: true },
        }),
        prisma.user.findUnique({
          where: { id: userId },
          select: { language: true },
        }),
      ]);

      //  prefer junction table, fall back to profile.preferredCrops
      const userCropsFromJunction = preferredCropsRows.map((r) => r.cropType);
      const userCrops =
        userCropsFromJunction.length > 0
          ? userCropsFromJunction
          : profile?.preferredCrops || [];

      const language = (user?.language === "tw" ? "tw" : "en") as "en" | "tw";

      //  reuse existing risk helpers (no Open-Meteo call)
      const riskInsights = generateDiseaseRiskInsights(
        rawData,
        userCrops,
        language,
      );
      const overallSummary = generateOverallSummary(
        rawData,
        riskInsights,
        language,
      );

      //  still log for history / analytics (not used as a cache for responses)
      await prisma.weatherRequest.create({
        data: {
          userId,
          latitude,
          longitude,
          rawData,
          riskSummary: { riskInsights, overallSummary },
        },
      });

      const hasInsights = await subscriptionService.canSeeCropInsights(userId);

      if (!hasInsights) {
        //  weather-only summary without crop disease risk names
        const temp = Math.round(rawData.current?.temperature_2m ?? 0);
        const humidity = rawData.current?.relative_humidity_2m ?? 0;
        const weatherOnlySummary =
          language === "tw"
            ? `Seesei temperature yɛ bɛyɛ ${temp}°C na humidity yɛ ${humidity}%. Hwɛ wɔ weather forecast no so.`
            : `Current temperature is around ${temp}°C with ${humidity}% humidity. See the forecast for the next days.`;

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
              weatherDescriptions: (rawData.daily?.weather_code || []).map(
                (code: number) => weatherCodeMap[code] || "Unknown",
              ),
            },
            // riskInsights intentionally omitted for free users
            overallSummary: weatherOnlySummary,
          },
        };
      }

      //  same response shape the app already expects
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
            weatherDescriptions: (rawData.daily?.weather_code || []).map(
              (code: number) => weatherCodeMap[code] || "Unknown",
            ),
          },
          riskInsights,
          overallSummary,
        },
      };
    } catch (error: any) {
      //  secure client message, detailed log for debugging
      console.error("Weather enrich error:", {
        message: error.message,
        code: error.code,
        status: error.response?.status,
      });
      return {
        success: false,
        message:
          "Unable to process weather data at the moment. Please try again later.",
        errorType: "WEATHER_ENRICH_FAILED",
      };
    }
  },
};
