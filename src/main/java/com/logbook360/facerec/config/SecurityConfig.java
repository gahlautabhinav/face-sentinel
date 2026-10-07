package com.logbook360.facerec.config;

import com.logbook360.facerec.security.JwtFilter;
import com.logbook360.facerec.security.JwtService;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtService jwtService;

    // Page origins allowed to call the API: comma-separated ALLOWED_ORIGINS. The default covers
    // both spellings of the local dev server (a browser opened on 127.0.0.1 sends that as Origin).
    @Value("${cors.allowed-origins}")
    private String[] allowedOrigins;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.POST, "/api/auth/token").permitAll()
                .requestMatchers(HttpMethod.GET,    "/api/face/enrollments").hasRole("ADMIN")
                .requestMatchers(HttpMethod.POST,   "/api/face/enroll").hasRole("ADMIN")
                .requestMatchers(HttpMethod.DELETE,  "/api/face/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/face/identify").hasRole("KIOSK")
                .requestMatchers(HttpMethod.POST, "/api/face/verify").hasRole("KIOSK")
                .requestMatchers(HttpMethod.POST, "/api/liveness/session").hasAnyRole("ADMIN", "KIOSK")
                .requestMatchers(HttpMethod.GET, "/api/liveness/session/**").hasAnyRole("ADMIN", "KIOSK")
                .requestMatchers(HttpMethod.POST, "/api/liveness/identify").hasRole("KIOSK")
                .requestMatchers(HttpMethod.POST, "/api/face/enroll-live").hasRole("ADMIN")
                .anyRequest().authenticated()
            )
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint((req, res, e) ->
                    res.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Unauthorized"))
                .accessDeniedHandler((req, res, e) ->
                    res.sendError(HttpServletResponse.SC_FORBIDDEN, "Forbidden"))
            )
            .addFilterBefore(new JwtFilter(jwtService), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of(allowedOrigins));
        config.setAllowedMethods(List.of("GET", "POST", "DELETE", "PUT", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setExposedHeaders(List.of("X-Tenant-Id"));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }
}
