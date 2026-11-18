import generated from '../../screens.generated.json';

export interface ScreenDefinition {
  key: string;
  title: string;
  source: string;
  bodyClass: string;
  bodyHtml: string;
}

const data = generated as unknown as {
  screens: Record<string, ScreenDefinition>;
  generatedAt: string;
};

export const screens = data.screens;
export const screenKeys = Object.keys(data.screens);
export const designGeneratedAt = data.generatedAt;
