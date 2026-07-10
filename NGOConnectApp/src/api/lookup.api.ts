import apiClient from './apiClient';
import {ApiResponse, LookupType, LookupValue} from '../types/api.types';

export const lookupApi = {
  getAllTypes: () =>
    apiClient.get<ApiResponse<LookupType[]>>('/lookup/types'),

  getValuesByTypeCode: (typeCode: string) =>
    apiClient.get<ApiResponse<LookupValue[]>>(`/lookup/values/${typeCode}`),

  getSingleValue: (typeCode: string, valueCode: string) =>
    apiClient.get<ApiResponse<LookupValue>>(`/lookup/values/${typeCode}/${valueCode}`),
};
