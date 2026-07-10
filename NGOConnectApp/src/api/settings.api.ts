import apiClient from './apiClient';
import {ApiResponse} from '../types/api.types';

export interface PublicSetting {
  settingKey: string;
  settingValue: string;
  dataType: string;
}

export const settingsApi = {
  getPublic: () =>
    apiClient.get<ApiResponse<PublicSetting[]>>('/settings/public'),
};
