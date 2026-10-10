/**
 * This file contains the SecurityConfig class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.security;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import java.util.Arrays;
import java.util.List;
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final CustomUserDetailsService customUserDetailsService;

    /** The only origin(s) browsers may call the API from; comma-separated for more than one. */
    @Value("${app.frontend.origin:http://localhost:5173}")
    private String frontendOrigin;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
            http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authenticationProvider(authenticationProvider())
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/auth/**").permitAll()
                        .requestMatchers("/api/ai/grants/**", "/api/ai/users/**").permitAll()
                        .requestMatchers("/api/ai/rag/index-grant", "/api/ai/rag/index-grants").permitAll()
                        .requestMatchers("/api/ai/rag/recommend").authenticated()
                        // Scraper endpoints: no user session, but GrantController checks the
                        // internal M2M token / X-API-KEY on each (InternalAuthVerifier).
                        .requestMatchers(HttpMethod.POST, "/api/grants").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/grants/verify").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/grants/remove").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/grants/urls").permitAll()
                        // Editing or deleting grant records is an admin task, not a user one.
                        .requestMatchers(HttpMethod.PUT, "/api/grants/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/grants/**").hasRole("ADMIN")
                        .requestMatchers("/api/grants/**").authenticated()
                        .requestMatchers("/api/researchers/**").authenticated()
                        .requestMatchers("/api/saved-grants/**").authenticated()
                        .requestMatchers("/api/applications/**").authenticated()
                        .requestMatchers("/api/proposal-reviews/**").authenticated()
                        .requestMatchers("/error").permitAll()
                        .anyRequest().authenticated())
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public DaoAuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider(customUserDetailsService);
        provider.setPasswordEncoder(passwordEncoder());
        return provider;
    }

    @Bean
    public AuthenticationManager authenticationManager (AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(Arrays.stream(frontendOrigin.split(","))
                .map(String::strip)
                .filter(origin -> !origin.isEmpty())
                .toList());
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-API-KEY"));
        // Content-Disposition carries the file name of downloads such as calendar.ics.
        configuration.setExposedHeaders(List.of("Authorization", "Content-Disposition"));
        configuration.setAllowCredentials(false);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}


