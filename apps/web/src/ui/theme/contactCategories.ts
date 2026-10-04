export type ContactCategoryName = 'Family' | 'Social' | 'Professional' | 'Emergency' | 'Other';

export const CATEGORY_COLORS_LIGHT: Record<ContactCategoryName, string> = {
  Family: '#2e7d32',
  Social: '#1565c0',
  Professional: '#7b1fa2',
  Emergency: '#b3261e',
  Other: '#6e7686',
};

export const CATEGORY_COLORS_DARK: Record<ContactCategoryName, string> = {
  Family: '#6bbf6e',
  Social: '#5b9bd5',
  Professional: '#c08fe0',
  Emergency: '#f2675e',
  Other: '#9aa3b2',
};
