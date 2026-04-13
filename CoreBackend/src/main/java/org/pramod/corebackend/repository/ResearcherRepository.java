package org.pramod.corebackend.repository;

import org.pramod.corebackend.entity.Researcher;
import org.pramod.corebackend.enums.PrimaryField;
import org.pramod.corebackend.enums.UserType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ResearcherRepository extends JpaRepository<Researcher, Long> {

    List<Researcher> findByUserType(UserType userType);

    List<Researcher> findByPrimaryField(PrimaryField primaryField);

    List<Researcher> findByCountry(String country);

    List<Researcher> findByCountryAndState(String country, String state);

    List<Researcher> findByInstitutionNameContainingIgnoreCase(String institutionName);

    Optional<Researcher> findByUserId(Long userId);
}

