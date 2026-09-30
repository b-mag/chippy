package com.chippy.security;

import org.springframework.stereotype.Component;

@Component
public class PermitAllAuthorization implements ChippyAuthorization {

    @Override
    public boolean canAccess(String action) {
        return true;
    }
}
