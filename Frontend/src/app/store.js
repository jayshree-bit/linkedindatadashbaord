import { configureStore } from '@reduxjs/toolkit';
import auth from '../features/authSlice';
import users from '../features/usersSlice';
import data from '../features/dataSlice';
import notificationReducer from '../features/notificationSlice';
import userActivityReducer from "../features/userActivitySlice";

export const store = configureStore({ reducer: { auth, users, data, notifications: notificationReducer, userActivities: userActivityReducer } });