// types/index.ts

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  token?: string;
  user?: any;
  error?: string;
}

export interface DetectionResult {
  id: string;
  imageUrl: string;
  diseaseName: string;
  confidence: number;
  possibleDiseases: Array<{ name: string; confidence: number }>;
  symptoms: string;
  causes: string;
  organicTreatments: string;
  chemicalOptions: string;
  prevention: string;
  localNotes: string;
  timestamp: string;
  isCorrectCrop?: boolean;
  detectedCrop?: string;
  cropVerificationReason?: string;
  detectedCropEnum?: string;
}

export interface SuggestAddToMyCrops {
  suggested: boolean;
  cropType: string;
  message: string;
}

export type DetectionSuccess = DetectionResult & {
  success: true;
  suggestAddToMyCrops?: SuggestAddToMyCrops;
};

export type DetectionError = {
  success: false;
  errorType:
    | "CROP_MISMATCH"
    | "INVALID_IMAGE"
    | "DEMO_MODE"
    | "AI_UNAVAILABLE"
    | "NO_PLANT_DETECTED";
  message: string;
  detectedCrop?: string;
  reason: string;
};

export type DetectionResponse = DetectionSuccess | DetectionError;

export interface WeatherForecastResponse {
  success: boolean;
  data?: {
    location: {
      latitude: number;
      longitude: number;
    };
    current: any;
    daily: any[];
    riskInsights: Array<{
      crop: string;
      riskLevel: "Low" | "Medium" | "High";
      message: string;
      factors: string[];
    }>;
    overallSummary: any;
  };
  message?: string;
  errorType?: string;
}

export interface LanguageUpdateRequest {
  language: "en" | "tw";
}

export interface LanguageUpdateResponse {
  success: boolean;
  message: string;
  language: "en" | "tw";
}
