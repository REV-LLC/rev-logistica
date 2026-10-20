'use client';

import { createContext, useContext } from 'react';

export const PageNavigationContext = createContext<(navigate: () => void) => void>(navigate => navigate());
export const usePageNavigation = () => useContext(PageNavigationContext);
